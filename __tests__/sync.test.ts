import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
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
import { syncItem } from '@/lib/sync'

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

function seedItem(db: ReturnType<typeof createTestDb>) {
  const itemId = crypto.randomUUID()
  db.insert(schema.items).values({
    id: itemId, plaidItemId: 'pi-1', accessToken: 'tok-1',
    cursor: null, institutionName: 'TD', createdAt: now(),
  }).run()
  return db.select().from(schema.items).get()!
}

describe('syncItem', () => {
  let db: ReturnType<typeof createTestDb>
  const mockedPlaid = plaidClient as jest.Mocked<typeof plaidClient>

  beforeEach(() => {
    db = createTestDb()
    jest.clearAllMocks()
  })

  it('inserts transactions from added array', async () => {
    const item = seedItem(db)

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

    const txs = db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(1)
    expect(txs[0].id).toBe('tx-1')
    expect(txs[0].pending).toBe(0)   // integer, not boolean

    const updatedItem = db.select().from(schema.items).get()!
    expect(updatedItem.cursor).toBe('cursor-2')
  })

  it('hard-deletes removed transactions', async () => {
    const item = seedItem(db)

    // Seed account and transaction to be removed
    const accountId = crypto.randomUUID()
    db.insert(schema.accounts).values({
      id: accountId, itemId: item.id, plaidAccountId: 'plaid-acc-1',
      name: 'Chequing', type: 'depository', subtype: 'chequing',
      balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now(),
    }).run()
    db.insert(schema.transactions).values({
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

    const txs = db.select().from(schema.transactions).all()
    expect(txs).toHaveLength(0)
  })

  it('writes a snapshot row after sync', async () => {
    const item = seedItem(db)

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

    await syncItem(db, item)

    const snaps = db.select().from(schema.snapshots).all()
    expect(snaps).toHaveLength(1)
    expect(snaps[0].totalAssets).toBe(5000)
    expect(snaps[0].totalLiabilities).toBe(0)
  })
})
