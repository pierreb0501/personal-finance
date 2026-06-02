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

async function fetchUsdCadRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { rates: { CAD: number } }
    return data.rates.CAD
  } catch {
    return 1.38 // reasonable fallback if the API is unavailable
  }
}

function resolveHoldingValue(
  h: { institution_value: number | null; institution_price: number | null; quantity: number | null; iso_currency_code: string | null },
  security: { close_price: number | null; iso_currency_code: string | null } | undefined,
  usdCadRate: number,
): number {
  // Use institution-provided value first (already in account currency)
  if (h.institution_value && h.institution_value > 0) return h.institution_value
  if (h.institution_price && h.institution_price > 0) return h.institution_price * (h.quantity ?? 0)

  // Fall back to security close_price × quantity, converting USD → CAD if needed
  const closePrice = security?.close_price ?? 0
  const qty = h.quantity ?? 0
  const securityCurrency = security?.iso_currency_code ?? 'CAD'
  const holdingCurrency = h.iso_currency_code ?? 'CAD'
  const fxRate = securityCurrency === 'USD' && holdingCurrency === 'CAD' ? usdCadRate : 1
  return closePrice * qty * fxRate
}

async function syncHoldings(db: DB, item: Item, accountMap: Map<string, string>) {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: item.accessToken,
  })

  const internalAccountIds = Array.from(accountMap.values())
  const { holdings, securities } = response.data
  const securityMap = new Map(securities.map((s) => [s.security_id, s]))
  const ts = Math.floor(Date.now() / 1000)

  // Fetch live USD/CAD rate once if any security is USD-priced against a CAD holding
  const needsFx = holdings.some((h) => {
    const sec = securityMap.get(h.security_id)
    return sec?.iso_currency_code === 'USD' && (h.iso_currency_code ?? 'CAD') === 'CAD'
  })
  const usdCadRate = needsFx ? await fetchUsdCadRate() : 1

  // Fetch the authoritative account balances that were just synced from the institution.
  // These are the exact values shown in Wealthsimple (or whichever institution).
  // We will scale individual holding values so they sum exactly to this balance.
  const accountBalances = new Map<string, number>()
  for (const [plaidAccountId, internalId] of accountMap.entries()) {
    const row = db
      .select({ balanceCurrent: schema.accounts.balanceCurrent })
      .from(schema.accounts)
      .where(eq(schema.accounts.id, internalId))
      .get()
    if (row) accountBalances.set(plaidAccountId, row.balanceCurrent)
  }

  // Group holdings by Plaid account_id so we can scale per account
  const holdingsByAccount = new Map<string, typeof holdings>()
  for (const h of holdings) {
    const bucket = holdingsByAccount.get(h.account_id) ?? []
    bucket.push(h)
    holdingsByAccount.set(h.account_id, bucket)
  }

  // Compute a price-based estimate for each holding (for relative weighting only),
  // then scale each group so the sum equals the institution's reported account balance.
  const scaledValueMap = new Map<typeof holdings[number], number>()

  for (const [plaidAccountId, accountHoldings] of holdingsByAccount.entries()) {
    const accountBalance = accountBalances.get(plaidAccountId) ?? 0

    // Raw estimates — used only as proportional weights
    const rawValues = accountHoldings.map((h) =>
      resolveHoldingValue(h, securityMap.get(h.security_id), usdCadRate)
    )
    const rawTotal = rawValues.reduce((s, v) => s + v, 0)

    accountHoldings.forEach((h, i) => {
      // If the institution provided no balance or no price data, fall back to raw estimate
      const scaled =
        accountBalance > 0 && rawTotal > 0
          ? (rawValues[i] / rawTotal) * accountBalance
          : rawValues[i]
      scaledValueMap.set(h, scaled)
    })
  }

  db.transaction((tx) => {
    if (internalAccountIds.length > 0) {
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
          institutionValue: scaledValueMap.get(h) ?? 0,
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

  // Use investment account balance_current directly — this is the exact value
  // the institution reports, not a computed approximation from holdings.
  const investmentsTotals = db
    .select({ total: sql<number>`COALESCE(SUM(balance_current), 0)` })
    .from(schema.accounts)
    .where(eq(schema.accounts.type, 'investment'))
    .get()

  const totalAssets = accountTotals?.assets ?? 0
  const totalLiabilities = accountTotals?.liabilities ?? 0
  const investmentsValue = investmentsTotals?.total ?? 0

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
