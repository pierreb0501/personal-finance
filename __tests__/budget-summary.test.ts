import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getCategoryLabels, setCategoryLabel } from '@/lib/db/queries'

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
