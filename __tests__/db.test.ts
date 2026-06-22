import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import {
  getLatestSnapshot,
  getMonthlySpend,
  getCategoryBreakdown,
  getAllHoldings,
  getUnlabeledTransfers,
  getRecurringMerchants,
  getRecurringMerchantsWithStatus,
  addCustomCategory,
  ensureCustomCategory,
  getCustomCategories,
} from '@/lib/db/queries'

// better-sqlite3 (sync) and the production libsql driver (async) expose the
// same drizzle query-builder surface at runtime but have structurally
// different types (e.g. only LibSQLDatabase has `.batch`), hence the cast —
// every query function only relies on the shared runtime surface.
function createTestDb(): DB {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db as unknown as DB
}

function now() {
  return Math.floor(Date.now() / 1000)
}

describe('query functions', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('getLatestSnapshot returns null when no data', async () => {
    expect(await getLatestSnapshot(db)).toBeNull()
  })

  it('getLatestSnapshot returns most recent row', async () => {
    db.insert(schema.snapshots).values({
      id: '1', date: '2026-05-01', totalAssets: 10000, totalLiabilities: 2000,
      netWorth: 8000, investmentsValue: 3000, createdAt: now(),
    }).run()
    db.insert(schema.snapshots).values({
      id: '2', date: '2026-05-30', totalAssets: 11000, totalLiabilities: 2000,
      netWorth: 9000, investmentsValue: 3200, createdAt: now(),
    }).run()
    const result = await getLatestSnapshot(db)
    expect(result?.netWorth).toBe(9000)
  })

  it('getMonthlySpend sums settled debits in current month', async () => {
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

    expect(await getMonthlySpend(db)).toBe(150)
  })

  it('getCategoryBreakdown groups by category, excludes pending', async () => {
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

    const breakdown = await getCategoryBreakdown(db)
    expect(breakdown).toHaveLength(2)
    // Ordered by total DESC: SHOPPING (100) first, FOOD_AND_DRINK (80) second
    expect(breakdown[0]).toEqual({ category: 'SHOPPING', total: 100 })
    expect(breakdown[1]).toEqual({ category: 'FOOD_AND_DRINK', total: 80 })
  })

  it('getAllHoldings returns all holdings with account name', async () => {
    const itemId = 'item-1'
    const accountId = 'acc-1'
    db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'Wealthsimple', createdAt: now() }).run()
    db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'TFSA', type: 'investment', subtype: 'brokerage', balanceCurrent: 10000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
    db.insert(schema.holdings).values({ id: 'h1', accountId, securityName: 'Vanguard S&P 500', tickerSymbol: 'VOO', quantity: 2.5, institutionValue: 1200, updatedAt: now() }).run()

    const holdings = await getAllHoldings(db)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].securityName).toBe('Vanguard S&P 500')
    expect(holdings[0].accountName).toBe('TFSA')
  })

  describe('getUnlabeledTransfers', () => {
    function seedAccount(db: ReturnType<typeof createTestDb>) {
      const itemId = 'item-1'
      const accountId = 'acc-1'
      db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
      db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
      return accountId
    }

    it('returns TRANSFER_IN/OUT transactions that have no custom category or rule', async () => {
      const accountId = seedAccount(db)
      const currentMonth = new Date().toISOString().slice(0, 7)
      db.insert(schema.transactions).values([
        { id: 't1', accountId, amount: -200, date: `${currentMonth}-05`, merchantName: 'E-Transfer', category: 'TRANSFER_IN', categoryDetailed: 'TRANSFER_IN_DEPOSIT', pending: 0 },
        { id: 't2', accountId, amount: -100, date: `${currentMonth}-06`, merchantName: 'Already Labeled', category: 'TRANSFER_IN', categoryDetailed: 'TRANSFER_IN_DEPOSIT', pending: 0, customCategory: 'RENT_AND_UTILITIES' },
      ]).run()

      const transfers = await getUnlabeledTransfers(db)
      expect(transfers).toHaveLength(1)
      expect(transfers[0].id).toBe('t1')
    })

    it('excludes transfers already covered by a merchant rule', async () => {
      const accountId = seedAccount(db)
      const currentMonth = new Date().toISOString().slice(0, 7)
      db.insert(schema.transactions).values({
        id: 't1', accountId, amount: -200, date: `${currentMonth}-05`,
        merchantName: 'Payroll Co', category: 'TRANSFER_IN', categoryDetailed: 'TRANSFER_IN_DEPOSIT', pending: 0,
      }).run()
      db.insert(schema.categoryRules).values({
        id: 'r1', merchantName: 'Payroll Co', category: 'INCOME', createdAt: now(),
      }).run()

      const transfers = await getUnlabeledTransfers(db)
      expect(transfers).toHaveLength(0)
    })
  })

  describe('recurring detection', () => {
    function seedAccount(db: ReturnType<typeof createTestDb>) {
      const itemId = 'item-1'
      const accountId = 'acc-1'
      db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
      db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
      return accountId
    }

    function monthsAgo(n: number, day: number): string {
      const d = new Date()
      d.setDate(1) // avoid month-length overflow when shifting months
      d.setMonth(d.getMonth() - n)
      d.setDate(day)
      return d.toISOString().slice(0, 10)
    }

    it('detects a merchant charging a consistent amount on the same day each month', async () => {
      const accountId = seedAccount(db)
      db.insert(schema.transactions).values([
        { id: 't1', accountId, amount: 15.99, date: monthsAgo(2, 10), merchantName: 'Netflix', category: 'ENTERTAINMENT', categoryDetailed: 'ENTERTAINMENT_OTHER', pending: 0 },
        { id: 't2', accountId, amount: 15.99, date: monthsAgo(1, 10), merchantName: 'Netflix', category: 'ENTERTAINMENT', categoryDetailed: 'ENTERTAINMENT_OTHER', pending: 0 },
      ]).run()

      const merchants = await getRecurringMerchants(db)
      expect(merchants).toHaveLength(1)
      expect(merchants[0].merchantName).toBe('Netflix')
      expect(merchants[0].avgAmount).toBeCloseTo(15.99)
    })

    it('does not flag two unrelated charges that coincidentally land on the same day with wildly different amounts', async () => {
      const accountId = seedAccount(db)
      db.insert(schema.transactions).values([
        { id: 't1', accountId, amount: 12, date: monthsAgo(2, 10), merchantName: 'Corner Store', category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_OTHER', pending: 0 },
        { id: 't2', accountId, amount: 480, date: monthsAgo(1, 11), merchantName: 'Corner Store', category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_OTHER', pending: 0 },
      ]).run()

      const merchants = await getRecurringMerchants(db)
      expect(merchants).toHaveLength(0)
    })

    it('flags an auto-detected merchant as likelyCancelled after missing two consecutive expected months', async () => {
      const accountId = seedAccount(db)
      // Charged on the 1st for two months further back, establishing the pattern,
      // then nothing since — well past the grace window for both this month and last.
      db.insert(schema.transactions).values([
        { id: 't1', accountId, amount: 9.99, date: monthsAgo(4, 1), merchantName: 'Old Gym', category: 'PERSONAL_CARE', categoryDetailed: 'PERSONAL_CARE_OTHER', pending: 0 },
        { id: 't2', accountId, amount: 9.99, date: monthsAgo(3, 1), merchantName: 'Old Gym', category: 'PERSONAL_CARE', categoryDetailed: 'PERSONAL_CARE_OTHER', pending: 0 },
      ]).run()

      const now_ = new Date()
      if (now_.getDate() <= 8) {
        // Too close to the 1st for the 7-day grace window to have elapsed —
        // skip rather than produce a flaky assertion near month start.
        return
      }

      const withStatus = await getRecurringMerchantsWithStatus(db, now_.getFullYear(), now_.getMonth() + 1)
      const gym = withStatus.find((m) => m.merchantName === 'Old Gym')
      expect(gym?.likelyCancelled).toBe(true)
    })
  })

  describe('custom categories', () => {
    it('addCustomCategory normalizes the name to a canonical slug', async () => {
      await addCustomCategory(db, 'Subscriptions')
      const cats = await getCustomCategories(db)
      expect(cats.map((c) => c.name)).toEqual(['SUBSCRIPTIONS'])
    })

    it('ensureCustomCategory registers a new non-built-in category exactly once', async () => {
      await ensureCustomCategory(db, 'side hustle')
      await ensureCustomCategory(db, 'SIDE_HUSTLE') // same category, different casing/spacing
      const cats = await getCustomCategories(db)
      expect(cats.map((c) => c.name)).toEqual(['SIDE_HUSTLE'])
    })

    it('ensureCustomCategory is a no-op for built-in categories', async () => {
      await ensureCustomCategory(db, 'FOOD_AND_DRINK')
      const cats = await getCustomCategories(db)
      expect(cats).toHaveLength(0)
    })
  })
})
