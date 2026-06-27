import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getBillTransactionIds, getSafeToSpend } from '@/lib/db/queries'

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

async function seedAccount(db: DB, opts: { type?: string; balanceCurrent?: number; balanceAvailable?: number | null } = {}) {
  await db.insert(schema.items).values({
    id: 'item1', plaidItemId: 'p1', accessToken: 'tok', cursor: null,
    institutionName: 'Test Bank', createdAt: now(), status: 'ok',
  }).run()
  await db.insert(schema.accounts).values({
    id: 'acc1', itemId: 'item1', plaidAccountId: 'pa1', name: 'Checking',
    type: opts.type ?? 'depository', subtype: 'checking',
    balanceCurrent: opts.balanceCurrent ?? 5000,
    balanceAvailable: opts.balanceAvailable === undefined ? 5000 : opts.balanceAvailable,
    isoCurrencyCode: 'CAD', updatedAt: now(),
  }).run()
}

let txSeq = 0
async function seedTx(db: DB, t: { amount: number; date: string; category: string; merchantName?: string | null; customCategory?: string | null; accountId?: string }) {
  txSeq += 1
  await db.insert(schema.transactions).values({
    id: `tx${txSeq}`, accountId: t.accountId ?? 'acc1', amount: t.amount, date: t.date,
    merchantName: t.merchantName ?? null, rawName: t.merchantName ?? null,
    category: t.category, categoryDetailed: t.category, pending: 0,
    customCategory: t.customCategory ?? null, ignored: 0,
  }).run()
  return `tx${txSeq}`
}

describe('getBillTransactionIds', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  it('claims the single best-match transaction for a committed expense item', async () => {
    await seedAccount(db)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 1,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const rentId = await seedTx(db, { amount: 1400, date: '2026-06-01', category: 'Rent' })
    await seedTx(db, { amount: 50, date: '2026-06-02', category: 'Dining' })

    const ids = await getBillTransactionIds(db, 2026, 6)
    expect(ids.has(rentId)).toBe(true)
    expect(ids.size).toBe(1)
  })

  it('does NOT absorb a discretionary transaction that merely shares a bill category', async () => {
    await seedAccount(db)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Hydro', type: 'expense', expectedAmount: 120, expectedDay: 15,
      merchantName: null, category: 'Utilities', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const billId = await seedTx(db, { amount: 120, date: '2026-06-15', category: 'Utilities' })
    await seedTx(db, { amount: 600, date: '2026-06-16', category: 'Utilities' })

    const ids = await getBillTransactionIds(db, 2026, 6)
    expect(ids.has(billId)).toBe(true)
    expect(ids.size).toBe(1)
  })
})

describe('getSafeToSpend', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  async function setLimit(v: number) {
    await db.insert(schema.settings).values({ key: 'allowance', value: String(v) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(v) } }).run()
  }
  async function setBuffer(v: number) {
    await db.insert(schema.settings).values({ key: 'safe_to_spend_buffer', value: String(v) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(v) } }).run()
  }

  it('happy path: limit minus discretionary spend, backstop not binding', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await seedTx(db, { amount: 1300, date: '2026-06-05', category: 'Dining' })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.discretionarySpent).toBe(1300)
    expect(r.limitSafe).toBe(1700)
    expect(r.safeToSpend).toBe(1700)
    expect(r.backstopBinding).toBe(false)
  })

  it('paid bills are excluded from discretionary spend', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 1,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    await seedTx(db, { amount: 1400, date: '2026-06-01', category: 'Rent' })
    await seedTx(db, { amount: 600, date: '2026-06-05', category: 'Dining' })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.paidBills).toBe(1400)
    expect(r.discretionarySpent).toBe(600)
    expect(r.limitSafe).toBe(2400)
  })

  it('cash backstop binds when cash cannot cover the limit number', async () => {
    await seedAccount(db, { balanceCurrent: 800, balanceAvailable: 800 })
    await setLimit(3000)
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(3000)
    expect(r.cashSafe).toBe(800)
    expect(r.safeToSpend).toBe(800)
    expect(r.backstopBinding).toBe(true)
  })

  it('credit card debt reduces the cash backstop exactly once', async () => {
    await seedAccount(db, { balanceCurrent: 2000, balanceAvailable: 2000 })
    await db.insert(schema.accounts).values({
      id: 'card1', itemId: 'item1', plaidAccountId: 'pa-card', name: 'Visa',
      type: 'credit', subtype: 'credit card', balanceCurrent: 500, balanceAvailable: null,
      isoCurrencyCode: 'CAD', updatedAt: now(),
    }).run()
    await setLimit(3000)
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.creditOwed).toBe(500)
    expect(r.cashSafe).toBe(1500)
  })

  it('buffer reduces only the cash backstop, never the limit number', async () => {
    await seedAccount(db, { balanceCurrent: 2000, balanceAvailable: 2000 })
    await setLimit(3000)
    await setBuffer(300)
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(3000)
    expect(r.cashSafe).toBe(1700)
  })

  it('over-limit produces a negative limitSafe', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(1000)
    await seedTx(db, { amount: 1200, date: '2026-06-05', category: 'Dining' })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(-200)
  })

  it('defaults: missing limit -> 3000, missing buffer -> 0', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.monthlyLimit).toBe(3000)
    expect(r.buffer).toBe(0)
  })

  it('unpaid bills are surfaced in billsStillDue without lowering limitSafe', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 28,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.billsStillDue).toBe(1400)
    expect(r.limitSafe).toBe(3000)
  })

  it('committed income items never count as bills', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Paycheck', type: 'income', expectedAmount: 4000, expectedDay: 30,
      merchantName: null, category: 'Income', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.billsStillDue).toBe(0)
    expect(r.paidBills).toBe(0)
  })
})
