import { eq, inArray, sql } from 'drizzle-orm'
import type { DB } from './db/index'
import * as schema from './db/schema'
import { db as defaultDb } from './db/index'
import { plaidClient } from './plaid'
import { applyAllCategoryRules } from './db/queries'

type Item = typeof schema.items.$inferSelect

// syncAll accepts an optional db for testability.
// Tests always pass an explicit in-memory db; production uses the default singleton.
export async function syncAll(db: DB = defaultDb) {
  const allItems = await db.select().from(schema.items).all()
  for (const item of allItems) {
    await syncItemReconcilingStatus(db, item)
  }
  await runPostSync(db)
}

// Sync one item and reconcile its status, swallowing errors so a single broken
// item never aborts the others (when called from the syncAll loop) or crashes
// the webhook. This is the only place item.status transitions on a sync.
async function syncItemReconcilingStatus(db: DB, item: Item) {
  try {
    await syncItem(db, item)
    // A previously broken item that now syncs cleanly is healthy again.
    if (item.status !== 'ok') {
      await db.update(schema.items).set({ status: 'ok' }).where(eq(schema.items.id, item.id)).run()
    }
  } catch (err) {
    console.error(`Sync failed for item ${item.institutionName}:`, (err as Error).message)
    const plaidErrorCode = (err as { response?: { data?: { error_code?: string } } }).response?.data?.error_code
    // ITEM_LOGIN_REQUIRED needs the user to reconnect; the rest are transient
    // (rate limits, Plaid still preparing data, etc.) so we just mark the item
    // broken without claiming it needs a fresh login — the next sync retries it.
    const status = plaidErrorCode === 'ITEM_LOGIN_REQUIRED'
      ? 'login_required'
      : plaidErrorCode
        ? 'error'
        : null
    if (status) {
      await db.update(schema.items).set({ status }).where(eq(schema.items.id, item.id)).run()
    }
  }
}

// Account-wide work that must run after any sync, whether it covered every item
// (syncAll) or just one (webhook): apply saved merchant rules to newly synced
// transactions, then snapshot net worth so the chart reflects the new balances.
async function runPostSync(db: DB) {
  await applyAllCategoryRules(db)
  await writeSnapshot(db)
}

// Webhook entry point: sync a single item end-to-end with the exact same status
// reconciliation and post-processing syncAll applies, so a Plaid-triggered update
// is never a second-class sync (missing category rules, snapshots, or status fix-ups).
export async function syncSingleItem(db: DB = defaultDb, item: Item) {
  await syncItemReconcilingStatus(db, item)
  await runPostSync(db)
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

  // 4. Sync investment transactions (optional — skip on error)
  try {
    await syncInvestmentTransactions(db, item, accountMap)
  } catch (err) {
    console.log(`Investment transactions sync skipped for item ${item.institutionName}:`, (err as Error).message)
  }
}

async function syncAccounts(db: DB, item: Item): Promise<Map<string, string>> {
  const response = await plaidClient.accountsGet({ access_token: item.accessToken })
  const plaidAccounts = response.data.accounts
  const ts = Math.floor(Date.now() / 1000)

  // Fetch any already-known ids up front so new rows can be inserted with a
  // pre-assigned id instead of re-selecting after each insert.
  const accountIds = plaidAccounts.map((a) => a.account_id)
  const existing = accountIds.length > 0
    ? await db
      .select({ id: schema.accounts.id, plaidAccountId: schema.accounts.plaidAccountId })
      .from(schema.accounts)
      .where(inArray(schema.accounts.plaidAccountId, accountIds))
      .all()
    : []
  const existingIds = new Map(existing.map((e) => [e.plaidAccountId, e.id]))

  const map = new Map<string, string>()

  for (const acc of plaidAccounts) {
    const id = existingIds.get(acc.account_id) ?? crypto.randomUUID()
    map.set(acc.account_id, id)

    await db.insert(schema.accounts)
      .values({
        id,
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

    let unmappedCount = 0

    // Each page is applied atomically together with its cursor advance, so a
    // crash mid-page can't leave partial writes paired with an already-advanced
    // cursor (which would make those rows unrecoverable on the next sync).
    await db.transaction(async (tx) => {
      for (const t of [...added, ...modified]) {
        const accountId = accountMap.get(t.account_id)
        if (!accountId) {
          unmappedCount++
          continue
        }

        await tx.insert(schema.transactions)
          .values({
            id: t.transaction_id,
            accountId,
            amount: t.amount,
            date: t.date,
            merchantName: t.merchant_name ?? null,
            rawName: t.name ?? null,
            category: t.personal_finance_category?.primary ?? 'OTHER',
            categoryDetailed: t.personal_finance_category?.detailed ?? 'OTHER_OTHER',
            pending: t.pending ? 1 : 0,
          })
          .onConflictDoUpdate({
            target: schema.transactions.id,
            set: {
              amount: t.amount,
              date: t.date,
              merchantName: t.merchant_name ?? null,
              rawName: t.name ?? null,
              category: t.personal_finance_category?.primary ?? 'OTHER',
              categoryDetailed: t.personal_finance_category?.detailed ?? 'OTHER_OTHER',
              pending: t.pending ? 1 : 0,
            },
          })
          .run()
      }

      if (removed.length > 0) {
        const ids = removed.map((r) => r.transaction_id).filter((id): id is string => typeof id === 'string')
        if (ids.length > 0) {
          await tx.delete(schema.transactions)
            .where(inArray(schema.transactions.id, ids))
            .run()
        }
      }

      // Save cursor in the same transaction as the page's writes
      await tx.update(schema.items)
        .set({ cursor: next_cursor })
        .where(eq(schema.items.id, item.id))
        .run()
    })

    if (unmappedCount > 0) {
      console.error(
        `Sync for item ${item.institutionName}: dropped ${unmappedCount} transaction(s) referencing an unmapped Plaid account_id`,
      )
    }

    cursor = next_cursor
    hasMore = has_more
  }
}

async function fetchUsdCadRate(): Promise<number> {
  try {
    const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CAD')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { rates: { CAD: number } }
    return data.rates.CAD
  } catch (err) {
    console.error('USD/CAD rate fetch failed, falling back to stale hardcoded rate (1.38):', (err as Error).message)
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
  if (internalAccountIds.length > 0) {
    const balanceRows = await db
      .select({ id: schema.accounts.id, balanceCurrent: schema.accounts.balanceCurrent })
      .from(schema.accounts)
      .where(inArray(schema.accounts.id, internalAccountIds))
      .all()
    const balanceById = new Map(balanceRows.map((r) => [r.id, r.balanceCurrent]))
    for (const [plaidAccountId, internalId] of accountMap.entries()) {
      const balance = balanceById.get(internalId)
      if (balance !== undefined) accountBalances.set(plaidAccountId, balance)
    }
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

  await db.transaction(async (tx) => {
    if (internalAccountIds.length > 0) {
      await tx.delete(schema.holdings)
        .where(inArray(schema.holdings.accountId, internalAccountIds))
        .run()
    }

    for (const h of holdings) {
      const accountId = accountMap.get(h.account_id)
      if (!accountId) continue
      const security = securityMap.get(h.security_id)

      await tx.insert(schema.holdings)
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

async function syncInvestmentTransactions(db: DB, item: Item, accountMap: Map<string, string>) {
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = '2020-01-01'
  const ts = Math.floor(Date.now() / 1000)

  let offset = 0
  let total = Infinity

  while (offset < total) {
    const response = await plaidClient.investmentsTransactionsGet({
      access_token: item.accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { offset, count: 100 },
    })

    const { investment_transactions, securities, total_investment_transactions } = response.data
    total = total_investment_transactions
    const securityMap = new Map(securities.map((s) => [s.security_id, s]))

    for (const t of investment_transactions) {
      const accountId = accountMap.get(t.account_id)
      if (!accountId) continue
      const security = t.security_id ? securityMap.get(t.security_id) : undefined

      await db.insert(schema.investmentTransactions)
        .values({
          id: t.investment_transaction_id,
          accountId,
          securityName: security?.name ?? null,
          tickerSymbol: security?.ticker_symbol ?? null,
          type: t.type,
          subtype: t.subtype ?? null,
          amount: t.amount,
          quantity: t.quantity ?? null,
          price: t.price ?? null,
          fees: t.fees ?? null,
          date: t.date,
          isoCurrencyCode: (t as any).iso_currency_code ?? 'CAD',
          updatedAt: ts,
        })
        .onConflictDoUpdate({
          target: schema.investmentTransactions.id,
          set: {
            amount: t.amount,
            quantity: t.quantity ?? null,
            price: t.price ?? null,
            fees: t.fees ?? null,
            updatedAt: ts,
          },
        })
        .run()
    }

    offset += investment_transactions.length
    if (investment_transactions.length === 0) break
  }
}

async function writeSnapshot(db: DB) {
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const accountTotals = await db
    .select({
      assets: sql<number>`COALESCE(SUM(CASE WHEN type IN ('depository', 'investment', 'other') THEN balance_current ELSE 0 END), 0)`,
      liabilities: sql<number>`COALESCE(SUM(CASE WHEN type IN ('credit', 'loan') THEN balance_current ELSE 0 END), 0)`,
    })
    .from(schema.accounts)
    .get()

  // Use investment account balance_current directly — this is the exact value
  // the institution reports, not a computed approximation from holdings.
  const investmentsTotals = await db
    .select({ total: sql<number>`COALESCE(SUM(balance_current), 0)` })
    .from(schema.accounts)
    .where(eq(schema.accounts.type, 'investment'))
    .get()

  const totalAssets = accountTotals?.assets ?? 0
  const totalLiabilities = accountTotals?.liabilities ?? 0
  const investmentsValue = investmentsTotals?.total ?? 0

  await db.insert(schema.snapshots)
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
