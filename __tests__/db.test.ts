import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import {
  getLatestSnapshot,
  getSnapshotHistory,
  getMonthlySpend,
  getCategoryBreakdown,
  getAllHoldings,
} from '@/lib/db/queries'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db
}

function now() {
  return Math.floor(Date.now() / 1000)
}

describe('query functions', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('getLatestSnapshot returns null when no data', () => {
    expect(getLatestSnapshot(db)).toBeNull()
  })

  it('getLatestSnapshot returns most recent row', () => {
    db.insert(schema.snapshots).values({
      id: '1', date: '2026-05-01', totalAssets: 10000, totalLiabilities: 2000,
      netWorth: 8000, investmentsValue: 3000, createdAt: now(),
    }).run()
    db.insert(schema.snapshots).values({
      id: '2', date: '2026-05-30', totalAssets: 11000, totalLiabilities: 2000,
      netWorth: 9000, investmentsValue: 3200, createdAt: now(),
    }).run()
    const result = getLatestSnapshot(db)
    expect(result?.netWorth).toBe(9000)
  })

  it('getSnapshotHistory returns rows ordered by date ascending', () => {
    db.insert(schema.snapshots).values([
      { id: '1', date: '2026-05-28', totalAssets: 10000, totalLiabilities: 2000, netWorth: 8000, investmentsValue: 3000, createdAt: now() },
      { id: '2', date: '2026-05-29', totalAssets: 10500, totalLiabilities: 2000, netWorth: 8500, investmentsValue: 3100, createdAt: now() },
    ]).run()
    db.insert(schema.snapshots).values({
      id: '3', date: '2026-01-01', totalAssets: 9000, totalLiabilities: 2000, netWorth: 7000, investmentsValue: 2800, createdAt: now(),
    }).run()
    const history = getSnapshotHistory(db, 30)
    expect(history).toHaveLength(2)
    expect(history[0].date).toBe('2026-05-28')
  })

  it('getMonthlySpend sums settled debits in current month', () => {
    const itemId = 'item-1'
    const accountId = 'acc-1'
    db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
    db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()

    const currentMonth = new Date().toISOString().slice(0, 7)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: `${currentMonth}-01`, merchantName: 'Tim Hortons', category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_COFFEE', pending: 0 },
      { id: 't2', accountId, amount: 100, date: `${currentMonth}-15`, merchantName: 'Metro', category: 'GROCERIES', categoryDetailed: 'GROCERIES_SUPERMARKETS', pending: 0 },
      { id: 't3', accountId, amount: 200, date: `${currentMonth}-20`, merchantName: 'Pending Store', category: 'SHOPPING', categoryDetailed: 'SHOPPING_GENERAL', pending: 1 },
    ]).run()

    expect(getMonthlySpend(db)).toBe(150)
  })

  it('getCategoryBreakdown groups by category, excludes pending', () => {
    const itemId = 'item-1'
    const accountId = 'acc-1'
    db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
    db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()

    const currentMonth = new Date().toISOString().slice(0, 7)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: `${currentMonth}-01`, category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_COFFEE', pending: 0 },
      { id: 't2', accountId, amount: 30, date: `${currentMonth}-02`, category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_RESTAURANTS', pending: 0 },
      { id: 't3', accountId, amount: 100, date: `${currentMonth}-03`, category: 'SHOPPING', categoryDetailed: 'SHOPPING_GENERAL', pending: 0 },
    ]).run()

    const breakdown = getCategoryBreakdown(db)
    expect(breakdown).toHaveLength(2)
    // Ordered by total DESC: SHOPPING (100) first, FOOD_AND_DRINK (80) second
    expect(breakdown[0]).toEqual({ category: 'SHOPPING', total: 100 })
    expect(breakdown[1]).toEqual({ category: 'FOOD_AND_DRINK', total: 80 })
  })

  it('getAllHoldings returns all holdings with account name', () => {
    const itemId = 'item-1'
    const accountId = 'acc-1'
    db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'Wealthsimple', createdAt: now() }).run()
    db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'TFSA', type: 'investment', subtype: 'brokerage', balanceCurrent: 10000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
    db.insert(schema.holdings).values({ id: 'h1', accountId, securityName: 'Vanguard S&P 500', tickerSymbol: 'VOO', quantity: 2.5, institutionValue: 1200, updatedAt: now() }).run()

    const holdings = getAllHoldings(db)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].securityName).toBe('Vanguard S&P 500')
    expect(holdings[0].accountName).toBe('TFSA')
  })
})
