import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getCategoryLabels, setCategoryLabel, getBudgetSummary } from '@/lib/db/queries'

function createTestDb(): DB {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db as unknown as DB
}
function now() { return Math.floor(Date.now() / 1000) }

async function seedAccount(db: DB) {
  await db.insert(schema.items).values({ id: 'item1', plaidItemId: 'p1', accessToken: 't', cursor: null, institutionName: 'Bank', createdAt: now(), status: 'ok' }).run()
  await db.insert(schema.accounts).values({ id: 'acc1', itemId: 'item1', plaidAccountId: 'pa1', name: 'Checking', type: 'depository', subtype: 'checking', balanceCurrent: 5000, balanceAvailable: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
}
let txSeq = 0
async function seedTx(db: DB, t: { amount: number; date: string; category: string; merchantName?: string | null }) {
  txSeq += 1
  await db.insert(schema.transactions).values({ id: `tx${txSeq}`, accountId: 'acc1', amount: t.amount, date: t.date, merchantName: t.merchantName ?? null, rawName: t.merchantName ?? null, category: t.category, categoryDetailed: t.category, pending: 0, customCategory: null, ignored: 0 }).run()
}
async function seedBudget(db: DB, category: string, planned: number, year = 2026, month = 6) {
  await db.insert(schema.categoryBudgets).values({ id: `b-${category}`, category, year, month, planned }).run()
}

describe('category labels', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  it('getCategoryLabels returns empty map when none set', async () => {
    expect((await getCategoryLabels(db)).size).toBe(0)
  })
  it('setCategoryLabel upserts and getCategoryLabels reads it back', async () => {
    await setCategoryLabel(db, 'Rent', 'fixed')
    await setCategoryLabel(db, 'Rent', 'flexible') // upsert
    const map = await getCategoryLabels(db)
    expect(map.get('Rent')).toBe('flexible')
  })
})

describe('getBudgetSummary', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  it('sums budgets by kind and total', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Rent', 2150); await setCategoryLabel(db, 'Rent', 'fixed')
    await seedBudget(db, 'Grocery', 400); await setCategoryLabel(db, 'Grocery', 'flexible')
    await seedBudget(db, 'Invest', 500); await setCategoryLabel(db, 'Invest', 'savings')
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.totalBudget).toBe(3050)
    expect(s.billsBudget).toBe(2150)
    expect(s.flexibleBudget).toBe(400)
    expect(s.savingsBudget).toBe(500)
  })

  it('flexibleRemaining = flexibleBudget - flexible spend', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Grocery', 400); await setCategoryLabel(db, 'Grocery', 'flexible')
    await seedTx(db, { amount: 150, date: '2026-06-05', category: 'Grocery' })
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.flexibleSpent).toBe(150)
    expect(s.flexibleRemaining).toBe(250)
  })

  it('flexible category with NO budget: spend lowers flexibleRemaining + shows as unbudgeted', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Grocery', 400); await setCategoryLabel(db, 'Grocery', 'flexible')
    await setCategoryLabel(db, 'Entertainment', 'flexible')
    await seedTx(db, { amount: 100, date: '2026-06-05', category: 'Entertainment' })
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.flexibleBudget).toBe(400)
    expect(s.flexibleSpent).toBe(100)
    expect(s.flexibleRemaining).toBe(300)
    expect(s.unbudgetedSpend).toBe(100)
    expect(s.unbudgetedCount).toBe(1)
  })

  it('fixed category with no budget + spend: in unbudgeted/total, not in flexibleRemaining', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Grocery', 400); await setCategoryLabel(db, 'Grocery', 'flexible')
    await setCategoryLabel(db, 'Rent', 'fixed')
    await seedTx(db, { amount: 2000, date: '2026-06-01', category: 'Rent' })
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.flexibleRemaining).toBe(400)
    expect(s.unbudgetedSpend).toBe(2000)
    expect(s.totalSpent).toBe(2000)
  })

  it('flexibleRemaining goes negative when overspent', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Grocery', 100); await setCategoryLabel(db, 'Grocery', 'flexible')
    await seedTx(db, { amount: 250, date: '2026-06-05', category: 'Grocery' })
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.flexibleRemaining).toBe(-150)
  })

  it('unlabeled category defaults to flexible', async () => {
    await seedAccount(db)
    await seedBudget(db, 'Grocery', 300)
    await seedTx(db, { amount: 50, date: '2026-06-05', category: 'Grocery' })
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.flexibleBudget).toBe(300)
    expect(s.flexibleSpent).toBe(50)
  })

  it('income category (from income committed item) excluded from all totals', async () => {
    await seedAccount(db)
    await db.insert(schema.committedItems).values({ id: 'c1', name: 'Tax', type: 'income', expectedAmount: 279, expectedDay: 1, merchantName: null, category: 'Tax Return', groupName: null, createdAt: now(), intervalMonths: 1, anchorYear: null, anchorMonth: null }).run()
    await seedBudget(db, 'Tax Return', 279)
    await seedBudget(db, 'Grocery', 400); await setCategoryLabel(db, 'Grocery', 'flexible')
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.totalBudget).toBe(400)
  })

  it('empty state: no budgets -> zeros, no throw', async () => {
    await seedAccount(db)
    const s = await getBudgetSummary(db, 2026, 6)
    expect(s.totalBudget).toBe(0)
    expect(s.flexibleRemaining).toBe(0)
    expect(s.unbudgetedCount).toBe(0)
  })
})
