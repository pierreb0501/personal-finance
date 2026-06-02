import { eq, inArray, sql } from 'drizzle-orm'
import type { DB } from './db/index'
import * as schema from './db/schema'
import { db as defaultDb } from './db/index'
import { plaidClient } from './plaid'

type Item = typeof schema.items.$inferSelect

// syncAll accepts an optional db for testability.
// Tests always pass an explicit in-memory db; production uses the default singleton.
export async function syncAll(db: DB = defaultDb) {
  const allItems = db.select().from(schema.items).all()
  for (const item of allItems) {
    try {
      await syncItem(db, item)
    } catch (err) {
      console.error(`Sync failed for item ${item.institutionName}:`, (err as Error).message)
    }
  }
  writeSnapshot(db)  // Once, after all items, so snapshot reflects complete state
}

export async function syncItem(db: DB, item: Item) {
  // 1. Sync accounts first — needed to build plaidAccountId → internal UUID map
  const accountMap = await syncAccounts(db, item)

  // 2. Sync transactions
  await syncTransactions(db, item, accountMap)

  // 3. Sync holdings (optional — skip on error)
  try {
    await syncHoldings(db, item, accountMap)
  } catch (err) {
    console.log(`Holdings sync skipped for item ${item.institutionName}:`, (err as Error).message)
  }
}

async function syncAccounts(db: DB, item: Item): Promise<Map<string, string>> {
  const response = await plaidClient.accountsGet({ access_token: item.accessToken })
  const plaidAccounts = response.data.accounts
  const map = new Map<string, string>()
  const ts = Math.floor(Date.now() / 1000)

  for (const acc of plaidAccounts) {
    db.insert(schema.accounts)
      .values({
        id: crypto.randomUUID(),
        itemId: item.id,
        plaidAccountId: acc.account_id,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype ?? '',
        balanceCurrent: acc.balances.current ?? 0,
        balanceAvailable: acc.balances.available ?? null,
        isoCurrencyCode: (acc as any).iso_currency_code ?? 'CAD',
        updatedAt: ts,
      })
      .onConflictDoUpdate({
        target: schema.accounts.plaidAccountId,
        set: {
          balanceCurrent: acc.balances.current ?? 0,
          balanceAvailable: acc.balances.available ?? null,
          updatedAt: ts,
        },
      })
      .run()

    const row = db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(eq(schema.accounts.plaidAccountId, acc.account_id))
      .get()!
    map.set(acc.account_id, row.id)
  }

  return map
}

async function syncTransactions(db: DB, item: Item, accountMap: Map<string, string>) {
  let cursor = item.cursor ?? undefined
  let hasMore = true

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.accessToken,
      cursor,
    })
    const { added, modified, removed, next_cursor, has_more } = response.data

    for (const tx of [...added, ...modified]) {
      const accountId = accountMap.get(tx.account_id)
      if (!accountId) continue

      db.insert(schema.transactions)
        .values({
          id: tx.transaction_id,
          accountId,
          amount: tx.amount,
          date: tx.date,
          merchantName: tx.merchant_name ?? null,
          category: tx.personal_finance_category?.primary ?? 'OTHER',
          categoryDetailed: tx.personal_finance_category?.detailed ?? 'OTHER_OTHER',
          pending: tx.pending ? 1 : 0,
        })
        .onConflictDoUpdate({
          target: schema.transactions.id,
          set: {
            amount: tx.amount,
            date: tx.date,
            merchantName: tx.merchant_name ?? null,
            category: tx.personal_finance_category?.primary ?? 'OTHER',
            categoryDetailed: tx.personal_finance_category?.detailed ?? 'OTHER_OTHER',
            pending: tx.pending ? 1 : 0,
          },
        })
        .run()
    }

    if (removed.length > 0) {
      const ids = removed.map((r) => r.transaction_id).filter((id): id is string => typeof id === 'string')
      if (ids.length > 0) {
        db.delete(schema.transactions)
          .where(inArray(schema.transactions.id, ids))
          .run()
      }
    }

    cursor = next_cursor
    hasMore = has_more

    // Save cursor after each page to ensure progress is not lost
    db.update(schema.items)
      .set({ cursor })
      .where(eq(schema.items.id, item.id))
      .run()
  }
}

async function syncHoldings(db: DB, item: Item, accountMap: Map<string, string>) {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: item.accessToken,
  })

  const internalAccountIds = Array.from(accountMap.values())
  const { holdings, securities } = response.data
  const securityMap = new Map(securities.map((s) => [s.security_id, s]))
  const ts = Math.floor(Date.now() / 1000)

  db.transaction((tx) => {
    if (internalAccountIds.length > 0) {
      // Delete holdings WHERE account_id IN (SELECT id FROM accounts WHERE item_id = ?)
      tx.delete(schema.holdings)
        .where(inArray(schema.holdings.accountId, internalAccountIds))
        .run()
    }

    for (const h of holdings) {
      const accountId = accountMap.get(h.account_id)
      if (!accountId) continue
      const security = securityMap.get(h.security_id)

      tx.insert(schema.holdings)
        .values({
          id: crypto.randomUUID(),
          accountId,
          securityName: security?.name ?? 'Unknown',
          tickerSymbol: security?.ticker_symbol ?? null,
          quantity: h.quantity,
          institutionValue: (h.institution_value && h.institution_value > 0)
            ? h.institution_value
            : (h.institution_price && h.institution_price > 0)
            ? h.institution_price * (h.quantity ?? 0)
            : (security?.close_price ?? 0) * (h.quantity ?? 0),
          costBasis: h.cost_basis ?? null,
          updatedAt: ts,
        })
        .run()
    }
  })
}

function writeSnapshot(db: DB) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const accountTotals = db
    .select({
      assets: sql<number>`COALESCE(SUM(CASE WHEN type IN ('depository', 'investment', 'other') THEN balance_current ELSE 0 END), 0)`,
      liabilities: sql<number>`COALESCE(SUM(CASE WHEN type IN ('credit', 'loan') THEN balance_current ELSE 0 END), 0)`,
    })
    .from(schema.accounts)
    .get()

  const holdingsTotals = db
    .select({ total: sql<number>`COALESCE(SUM(institution_value), 0)` })
    .from(schema.holdings)
    .get()

  const totalAssets = accountTotals?.assets ?? 0
  const totalLiabilities = accountTotals?.liabilities ?? 0
  const investmentsValue = holdingsTotals?.total ?? 0

  db.insert(schema.snapshots)
    .values({
      id: crypto.randomUUID(),
      date: dateStr,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      investmentsValue,
      createdAt: Math.floor(Date.now() / 1000),
    })
    .onConflictDoUpdate({
      target: schema.snapshots.date,
      set: {
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        investmentsValue,
      },
    })
    .run()
}
