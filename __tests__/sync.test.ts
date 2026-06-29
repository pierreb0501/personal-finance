import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import path from 'path'
import os from 'os'
import fs from 'fs'
import * as schema from '@/lib/db/schema'

// Mock the Plaid client
jest.mock('@/lib/plaid', () => ({
  plaidClient: {
    transactionsSync: jest.fn(),
    accountsGet: jest.fn(),
    investmentsHoldingsGet: jest.fn(),
  },
}))

import { plaidClient } from '@/lib/plaid'
import { syncAll, syncItem, syncSingleItem } from '@/lib/sync'

// Uses the same libsql driver as production (just pointed at a throwaway
// temp file), rather than better-sqlite3 — the two drivers disagree on
// whether db.transaction() callbacks may be async (libsql requires it,
// better-sqlite3 forbids it), so testing against a different driver than
// production masked a real bug in syncTransactions' per-page transaction
// wrapping. A real file is used instead of ':memory:' because libsql's
// in-memory mode opens a fresh, unshared database per connection — writes
// made inside db.transaction() (which opens its own connection) would
// otherwise vanish as soon as the transaction committed.
const tmpFiles: string[] = []

async function createTestDb() {
  const file = path.join(os.tmpdir(), `pf-test-${crypto.randomUUID()}.db`)
  tmpFiles.push(file)
  const client = createClient({ url: `file:${file}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db
}

function now() {
  return Math.floor(Date.now() / 1000)
}

async function seedItem(db: Awaited<ReturnType<typeof createTestDb>>) {
  const itemId = crypto.randomUUID()
  await db.insert(schema.items).values({
    id: itemId, plaidItemId: 'pi-1', accessToken: 'tok-1',
    cursor: null, institutionName: 'TD', createdAt: now(),
  }).run()
  return (await db.select().from(schema.items).get())!
}

describe('syncItem', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  const mockedPlaid = plaidClient as jest.Mocked<typeof plaidClient>

  beforeEach(async () => {
    db = await createTestDb()
    jest.clearAllMocks()
  })

  afterAll(() => {
    for (const file of tmpFiles) {
      for (const suffix of ['', '-wal', '-shm']) {
        fs.rmSync(file + suffix, { force: true })
      }
    }
  })

  it('inserts transactions from added array', async () => {
    const item = await seedItem(db)

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: 4800 },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: {
        added: [{
          transaction_id: 'tx-1', account_id: 'plaid-acc-1', amount: 50,
          date: '2026-05-01', merchant_name: 'Tim Hortons',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
          pending: false,
        }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncItem(db, item)

    const txs = await db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(1)
    expect(txs[0].id).toBe('tx-1')
    expect(txs[0].pending).toBe(0)   // integer, not boolean

    const updatedItem = (await db.select().from(schema.items).get())!
    expect(updatedItem.cursor).toBe('cursor-2')
  })

  it('falls back to a normalized raw_name when Plaid gives no merchant_name', async () => {
    const item = await seedItem(db)

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: 4800 },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: {
        added: [{
          transaction_id: 'tx-raw', account_id: 'plaid-acc-1', amount: 12,
          date: '2026-05-01', merchant_name: null, name: 'SQ *BLUE BOTTLE 3491 MONTREAL QC',
          personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' },
          pending: false,
        }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncItem(db, item)

    const tx = (await db.select().from(schema.transactions).get())!
    // Display/match name is the cleaned merchant; the true raw descriptor is preserved.
    expect(tx.merchantName).toBe('Blue Bottle Montreal')
    expect(tx.rawName).toBe('SQ *BLUE BOTTLE 3491 MONTREAL QC')
  })

  it('leaves merchantless credit-card-payment inflows nameless, but names refunds', async () => {
    const item = await seedItem(db)

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Amex', type: 'credit',
          subtype: 'credit card', balances: { current: -500, available: null },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: {
        added: [
          {
            // Card payment: money landing on the card (amount < 0), no merchant,
            // payment-ish category → must stay null so isCardPayment still flags it.
            transaction_id: 'tx-pay', account_id: 'plaid-acc-1', amount: -300,
            date: '2026-05-01', merchant_name: null, name: 'PAYMENT RECEIVED - THANK YOU',
            personal_finance_category: { primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' },
            pending: false,
          },
          {
            // Refund on the same credit card (amount < 0) but a SPEND category — not
            // a card payment, so it should still get a clean, ruleable name.
            transaction_id: 'tx-refund', account_id: 'plaid-acc-1', amount: -45.97,
            date: '2026-05-02', merchant_name: null, name: 'ALDO MONTREAL QC',
            personal_finance_category: { primary: 'GENERAL_MERCHANDISE', detailed: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES' },
            pending: false,
          },
        ],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncItem(db, item)

    const pay = (await db.select().from(schema.transactions).where(eq(schema.transactions.id, 'tx-pay')).get())!
    expect(pay.merchantName).toBeNull()

    const refund = (await db.select().from(schema.transactions).where(eq(schema.transactions.id, 'tx-refund')).get())!
    expect(refund.merchantName).toBe('Aldo Montreal')
  })

  it('drops transactions referencing an unmapped account without throwing', async () => {
    const item = await seedItem(db)

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: 4800 },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: {
        added: [{
          transaction_id: 'tx-orphan', account_id: 'plaid-acc-UNKNOWN', amount: 50,
          date: '2026-05-01', merchant_name: 'Mystery Charge',
          personal_finance_category: { primary: 'OTHER', detailed: 'OTHER_OTHER' },
          pending: false,
        }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncItem(db, item)

    const txs = await db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(0)

    const updatedItem = (await db.select().from(schema.items).get())!
    expect(updatedItem.cursor).toBe('cursor-2')
  })

  it('hard-deletes removed transactions', async () => {
    const item = await seedItem(db)

    // Seed account and transaction to be removed
    const accountId = crypto.randomUUID()
    await db.insert(schema.accounts).values({
      id: accountId, itemId: item.id, plaidAccountId: 'plaid-acc-1',
      name: 'Chequing', type: 'depository', subtype: 'chequing',
      balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now(),
    }).run()
    await db.insert(schema.transactions).values({
      id: 'tx-stale', accountId, amount: 100, date: '2026-04-01',
      category: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_COFFEE', pending: 0,
    }).run()

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: null },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: {
        added: [], modified: [],
        removed: [{ transaction_id: 'tx-stale' }],
        next_cursor: 'c2', has_more: false,
      },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncItem(db, item)

    const txs = await db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(0)
  })

  it('writes a snapshot row after sync', async () => {
    await seedItem(db)

    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: 4800 },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)

    mockedPlaid.transactionsSync.mockResolvedValue({
      data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false },
    } as any)

    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncAll(db)

    const snaps = await db.select().from(schema.snapshots).all()
    expect(snaps).toHaveLength(1)
    expect(snaps[0].totalAssets).toBe(5000)
    expect(snaps[0].totalLiabilities).toBe(0)
  })

  it('marks the item status on a non-login-required Plaid error and clears it on the next success', async () => {
    await seedItem(db)

    mockedPlaid.accountsGet.mockRejectedValue(
      Object.assign(new Error('rate limited'), { response: { data: { error_code: 'RATE_LIMIT_EXCEEDED' } } }),
    )

    await syncAll(db)

    let updatedItem = (await db.select().from(schema.items).get())!
    expect(updatedItem.status).toBe('error')

    // Next sync succeeds — status should clear back to 'ok'
    mockedPlaid.accountsGet.mockResolvedValue({
      data: {
        accounts: [{
          account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
          subtype: 'checking', balances: { current: 5000, available: 4800 },
          iso_currency_code: 'CAD',
        }],
      },
    } as any)
    mockedPlaid.transactionsSync.mockResolvedValue({
      data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false },
    } as any)
    mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

    await syncAll(db)

    updatedItem = (await db.select().from(schema.items).get())!
    expect(updatedItem.status).toBe('ok')
  })

  // syncSingleItem is the webhook entry point. It must behave exactly like one
  // iteration of syncAll's loop plus the post-sync work — not a degraded sync.
  describe('syncSingleItem (webhook path)', () => {
    it('runs post-sync work (writes a snapshot) for a single item', async () => {
      const item = await seedItem(db)

      mockedPlaid.accountsGet.mockResolvedValue({
        data: {
          accounts: [{
            account_id: 'plaid-acc-1', name: 'Chequing', type: 'depository',
            subtype: 'checking', balances: { current: 5000, available: 4800 },
            iso_currency_code: 'CAD',
          }],
        },
      } as any)
      mockedPlaid.transactionsSync.mockResolvedValue({
        data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false },
      } as any)
      mockedPlaid.investmentsHoldingsGet.mockRejectedValue(new Error('not supported'))

      await syncSingleItem(db, item)

      const snaps = await db.select().from(schema.snapshots).all()
      expect(snaps).toHaveLength(1)
      expect(snaps[0].totalAssets).toBe(5000)

      const updatedItem = (await db.select().from(schema.items).get())!
      expect(updatedItem.status).toBe('ok')
    })

    it('marks the item login_required when Plaid asks for reconnect, without crashing', async () => {
      const item = await seedItem(db)

      mockedPlaid.accountsGet.mockRejectedValue(
        Object.assign(new Error('login required'), { response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } }),
      )

      // Must resolve (webhook caller relies on it never throwing)
      await expect(syncSingleItem(db, item)).resolves.toBeUndefined()

      const updatedItem = (await db.select().from(schema.items).get())!
      expect(updatedItem.status).toBe('login_required')

      // Post-sync work still runs even though the item failed
      const snaps = await db.select().from(schema.snapshots).all()
      expect(snaps).toHaveLength(1)
    })
  })
})
