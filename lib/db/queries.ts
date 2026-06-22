import { desc, eq, and, gte, sql, asc, inArray, ne } from 'drizzle-orm'
import * as schema from './schema'
import type { DB } from './index'
import { applyCategoryRules, slugifyCategory, CATEGORY_LABELS, type CategoryRule } from '@/lib/categories'
import { MANUAL_IMPORT_ITEM_ID } from '@/lib/constants'

function shortAccountLabel(accountName: string, institutionName: string): string {
  const inst = institutionName.toLowerCase()
  const acc = accountName.toLowerCase()
  if (inst.includes('american express') || acc.includes('american express') || acc.includes('boustany')) return 'Amex'
  if (inst.includes('td') || inst.includes('toronto-dominion')) {
    if (acc.includes('chequing') || acc.includes('checking')) return 'TD Chequing'
    if (acc.includes('savings') || acc.includes('epremium')) return 'TD Savings'
    if (acc.includes('visa') || acc.includes('rewards')) return 'TD Visa'
    return 'TD'
  }
  if (inst.includes('wealthsimple')) {
    if (acc.includes('tfsa')) return 'WS TFSA'
    return 'WS Debit'
  }
  return accountName.substring(0, 14)
}

function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthBounds(year?: number, month?: number): { start: string; end: string } {
  const now = new Date()
  const y = year ?? now.getFullYear()
  const m = month ?? now.getMonth() + 1
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const nextMonth = new Date(y, m, 1)
  const end = localDateString(new Date(nextMonth.getTime() - 1))
  return { start, end }
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export async function getLatestSnapshot(db: DB) {
  const row = await db
    .select()
    .from(schema.snapshots)
    .orderBy(desc(schema.snapshots.date))
    .limit(1)
    .get()
  return row ?? null
}

export async function getAllSnapshotHistory(db: DB) {
  return db
    .select()
    .from(schema.snapshots)
    .orderBy(asc(schema.snapshots.date))
    .all()
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export async function getAllAccounts(db: DB) {
  return db
    .select()
    .from(schema.accounts)
    .where(ne(schema.accounts.itemId, MANUAL_IMPORT_ITEM_ID))
    .orderBy(asc(schema.accounts.type), asc(schema.accounts.name))
    .all()
}

export async function getCreditCardBalances(db: DB) {
  const rows = await db
    .select({
      name: schema.accounts.name,
      balanceCurrent: schema.accounts.balanceCurrent,
      institutionName: schema.items.institutionName,
    })
    .from(schema.accounts)
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .where(and(eq(schema.accounts.type, 'credit'), ne(schema.accounts.itemId, MANUAL_IMPORT_ITEM_ID)))
    .all()

  return rows
    .map((r) => ({
      label: shortAccountLabel(r.name, r.institutionName ?? ''),
      balance: r.balanceCurrent,
    }))
    .sort((a, b) => b.balance - a.balance)
}

export async function getBrokenItems(db: DB) {
  return db
    .select({ id: schema.items.id, institutionName: schema.items.institutionName })
    .from(schema.items)
    .where(eq(schema.items.status, 'login_required'))
    .all()
}

export async function getAllItemsWithAccounts(db: DB) {
  const itemRows = await db
    .select()
    .from(schema.items)
    .where(ne(schema.items.id, MANUAL_IMPORT_ITEM_ID))
    .orderBy(asc(schema.items.institutionName))
    .all()

  const accountRows = await getAllAccounts(db)

  return itemRows.map((item) => ({
    id: item.id,
    institutionName: item.institutionName,
    status: item.status,
    accounts: accountRows.filter((a) => a.itemId === item.id),
  }))
}

// Deletes an account and its dependent rows. If it was the last account on its
// item, also deletes the item and returns its access token so the caller can
// revoke it with Plaid.
export async function deleteAccount(db: DB, accountId: string): Promise<{ itemDeleted: boolean; accessToken: string | null }> {
  const account = await db
    .select({ itemId: schema.accounts.itemId })
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .get()

  if (!account) return { itemDeleted: false, accessToken: null }

  await db.delete(schema.holdings).where(eq(schema.holdings.accountId, accountId)).run()
  await db.delete(schema.transactions).where(eq(schema.transactions.accountId, accountId)).run()
  await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId)).run()

  if (account.itemId === MANUAL_IMPORT_ITEM_ID) {
    return { itemDeleted: false, accessToken: null }
  }

  const remaining = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(eq(schema.accounts.itemId, account.itemId))
    .all()

  if (remaining.length > 0) {
    return { itemDeleted: false, accessToken: null }
  }

  const item = await db
    .select({ accessToken: schema.items.accessToken })
    .from(schema.items)
    .where(eq(schema.items.id, account.itemId))
    .get()

  await db.delete(schema.items).where(eq(schema.items.id, account.itemId)).run()

  return { itemDeleted: true, accessToken: item?.accessToken ?? null }
}

export async function getLastSyncedAt(db: DB): Promise<number | null> {
  const result = await db
    .select({ maxUpdated: sql<number>`MAX(${schema.accounts.updatedAt})` })
    .from(schema.accounts)
    .get()
  return result?.maxUpdated ?? null
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getMonthlySpend(db: DB, year?: number, month?: number): Promise<number> {
  const { start, end } = monthBounds(year, month)
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        // Include regular expenses AND labeled transfer-ins (which reduce spend)
        sql`(${schema.transactions.amount} > 0 OR (${schema.transactions.amount} < 0 AND ${schema.transactions.customCategory} IS NOT NULL))`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      ),
    )
    .get()
  return result?.total ?? 0
}

export async function getSpendByAccount(db: DB, year?: number, month?: number) {
  const { start, end } = monthBounds(year, month)

  const rows = await db
    .select({
      accountName: schema.accounts.name,
      institutionName: schema.items.institutionName,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .innerJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      ),
    )
    .groupBy(schema.transactions.accountId)
    .all()

  const agg = new Map<string, number>()
  for (const r of rows) {
    const label = shortAccountLabel(r.accountName, r.institutionName ?? '')
    agg.set(label, (agg.get(label) ?? 0) + r.total)
  }
  return Array.from(agg.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total)
}

export async function getCategoryBreakdown(db: DB, year?: number, month?: number) {
  const { start, end } = monthBounds(year, month)
  const rules = await getMerchantRules(db)

  const rows = await db
    .select({
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      merchantName: schema.transactions.merchantName,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        // Include regular expenses AND labeled transfer-ins (deducted from their category)
        sql`(${schema.transactions.amount} > 0 OR (${schema.transactions.amount} < 0 AND ${schema.transactions.customCategory} IS NOT NULL))`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      ),
    )
    .groupBy(schema.transactions.category, schema.transactions.merchantName, schema.transactions.customCategory)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .all()

  const applied = applyCategoryRules(rows.map(r => ({
    ...r,
    merchantName: r.merchantName ?? null,
    customCategory: r.customCategory ?? null,
  })), rules)

  const agg = new Map<string, number>()
  for (const r of applied) {
    agg.set(r.category, (agg.get(r.category) ?? 0) + r.total)
  }
  return Array.from(agg.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export async function getRecentTransactions(db: DB, limit = 20) {
  const rules = await getMerchantRules(db)
  const rows = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      merchantName: schema.transactions.merchantName,
      rawName: schema.transactions.rawName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      pending: schema.transactions.pending,
      ignored: schema.transactions.ignored,
    })
    .from(schema.transactions)
    .where(
      and(
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.amount))
    .limit(limit)
    .all()

  return applyCategoryRules(
    rows.map((r) => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )
}

export async function getTransactionsForMonth(db: DB, year: number, month: number) {
  const { start, end } = monthBounds(year, month)
  const rules = await getMerchantRules(db)

  const rows = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      merchantName: schema.transactions.merchantName,
      rawName: schema.transactions.rawName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      pending: schema.transactions.pending,
      ignored: schema.transactions.ignored,
      accountName: schema.accounts.name,
      institutionName: schema.items.institutionName,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .orderBy(desc(schema.transactions.date), sql`ABS(${schema.transactions.amount}) DESC`)
    .all()

  return applyCategoryRules(
    rows.map((r) => ({
      ...r,
      merchantName: r.merchantName ?? null,
      customCategory: r.customCategory ?? null,
      accountLabel: shortAccountLabel(r.accountName ?? '', r.institutionName ?? ''),
    })),
    rules,
  )
}

export async function getUnlabeledTransfers(db: DB, year?: number, month?: number) {
  const { start, end } = monthBounds(year, month)
  const rules = await getMerchantRules(db)
  const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))

  const rows = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      pending: schema.transactions.pending,
      ignored: schema.transactions.ignored,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.category} IN ('TRANSFER_IN', 'TRANSFER_OUT')`,
        sql`${schema.transactions.customCategory} IS NULL`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      )
    )
    .orderBy(desc(schema.transactions.date))
    .all()

  // Mirror applyCategoryRules: a merchant rule also counts as labeled
  return rows.filter((tx) => !(tx.merchantName && ruleMap.has(tx.merchantName)))
}

export async function setTransactionIgnored(db: DB, txId: string, ignored: boolean): Promise<void> {
  await db.update(schema.transactions)
    .set({ ignored: ignored ? 1 : 0 })
    .where(eq(schema.transactions.id, txId))
    .run()
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export async function getAllHoldings(db: DB) {
  return db
    .select({
      id: schema.holdings.id,
      accountId: schema.holdings.accountId,
      accountName: schema.accounts.name,
      securityName: schema.holdings.securityName,
      tickerSymbol: schema.holdings.tickerSymbol,
      quantity: schema.holdings.quantity,
      institutionValue: schema.holdings.institutionValue,
      costBasis: schema.holdings.costBasis,
    })
    .from(schema.holdings)
    .innerJoin(schema.accounts, eq(schema.holdings.accountId, schema.accounts.id))
    .all()
}

// ─── Category rules ───────────────────────────────────────────────────────────

export async function getMerchantRules(db: DB): Promise<CategoryRule[]> {
  return db
    .select()
    .from(schema.categoryRules)
    .all()
}

export async function upsertCategoryRule(db: DB, merchantName: string, category: string): Promise<void> {
  const id = `rule_${merchantName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
  await db
    .insert(schema.categoryRules)
    .values({ id, merchantName, category, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: schema.categoryRules.merchantName,
      set: { category },
    })
    .run()
  // Backfill: apply the rule to any transactions that don't have a manual override yet
  await db
    .update(schema.transactions)
    .set({ customCategory: category })
    .where(
      and(
        eq(schema.transactions.merchantName, merchantName),
        sql`${schema.transactions.customCategory} IS NULL`,
      )
    )
    .run()
}

export async function deleteCategoryRule(db: DB, id: string): Promise<void> {
  await db.delete(schema.categoryRules).where(eq(schema.categoryRules.id, id)).run()
}

export async function applyAllCategoryRules(db: DB): Promise<void> {
  const rules = await getMerchantRules(db)
  if (rules.length === 0) return

  const merchantNames = rules.map((r) => r.merchantName)
  const caseClauses = sql.join(
    rules.map((r) => sql`WHEN ${schema.transactions.merchantName} = ${r.merchantName} THEN ${r.category}`),
    sql` `,
  )

  await db
    .update(schema.transactions)
    .set({ customCategory: sql`CASE ${caseClauses} END` })
    .where(
      and(
        inArray(schema.transactions.merchantName, merchantNames),
        sql`${schema.transactions.customCategory} IS NULL`,
      )
    )
    .run()
}

export async function updateTransactionCategory(db: DB, txId: string, category: string): Promise<void> {
  await db
    .update(schema.transactions)
    .set({ customCategory: category })
    .where(eq(schema.transactions.id, txId))
    .run()
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSetting(db: DB, key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get()
  return row?.value ?? null
}

export async function upsertSetting(db: DB, key: string, value: string): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run()
}

// ─── Category budgets (per-month planner) ────────────────────────────────────

export async function getCategoryBudgets(db: DB, year: number, month: number) {
  return db
    .select()
    .from(schema.categoryBudgets)
    .where(
      and(
        eq(schema.categoryBudgets.year, year),
        eq(schema.categoryBudgets.month, month),
      )
    )
    .all()
}

export async function upsertCategoryBudget(db: DB, category: string, year: number, month: number, planned: number): Promise<void> {
  await db
    .insert(schema.categoryBudgets)
    .values({ id: `${category}_${year}_${month}`, category, year, month, planned })
    .onConflictDoUpdate({
      target: schema.categoryBudgets.id,
      set: { planned },
    })
    .run()
}

export async function deleteCategoryBudget(db: DB, category: string, year: number, month: number): Promise<void> {
  await db
    .delete(schema.categoryBudgets)
    .where(
      and(
        eq(schema.categoryBudgets.category, category),
        eq(schema.categoryBudgets.year, year),
        eq(schema.categoryBudgets.month, month),
      )
    )
    .run()
}

export async function getMostRecentBudgets(db: DB, beforeYear: number, beforeMonth: number) {
  // Find all months with budgets prior to the given month, pick the most recent one
  const allPrior = await db
    .select()
    .from(schema.categoryBudgets)
    .where(
      sql`(${schema.categoryBudgets.year} * 12 + ${schema.categoryBudgets.month}) < (${beforeYear} * 12 + ${beforeMonth})`
    )
    .orderBy(
      desc(sql`${schema.categoryBudgets.year} * 12 + ${schema.categoryBudgets.month}`)
    )
    .all()

  if (allPrior.length === 0) return []

  // Take only entries from the most recent month found
  const maxKey = allPrior[0].year * 12 + allPrior[0].month
  return allPrior.filter(b => b.year * 12 + b.month === maxKey)
}

export async function seedBudgetFromPrevious(db: DB, year: number, month: number): Promise<void> {
  const previous = await getMostRecentBudgets(db, year, month)
  if (previous.length === 0) return

  await db
    .insert(schema.categoryBudgets)
    .values(previous.map((b) => ({
      id: `${b.category}_${year}_${month}`,
      category: b.category,
      year,
      month,
      planned: b.planned,
    })))
    .onConflictDoUpdate({
      target: schema.categoryBudgets.id,
      set: { planned: sql`excluded.planned` },
    })
    .run()
}

// ─── Custom categories ────────────────────────────────────────────────────────

export async function getRecurringMerchants(db: DB) {
  const now = new Date()
  // A 5-month window (instead of 3) so a merchant that's gone 1-2 months
  // without charging still has enough history to be recognized as
  // "established, but currently missing" (see likelyCancelled below) rather
  // than rolling out of view the moment its most recent matching months age
  // out of a too-tight lookback.
  const start = new Date(now.getFullYear(), now.getMonth() - 4, 1)
  const rangeStart = localDateString(start)

  const rules = await getMerchantRules(db)

  const dismissedRows = await db.select().from(schema.dismissedRecurring).all()
  const dismissed = new Set(dismissedRows.map(r => r.merchantName))
  const manual = await db.select().from(schema.manualRecurring).all()

  const rows = await db
    .select({
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      monthKey: sql<string>`strftime('%Y-%m', ${schema.transactions.date})`,
      dayOfMonth: sql<number>`CAST(strftime('%d', ${schema.transactions.date}) AS INTEGER)`,
      amount: schema.transactions.amount,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, rangeStart),
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
        sql`${schema.transactions.merchantName} IS NOT NULL`,
      )
    )
    .all()

  const applied = applyCategoryRules(
    rows.map(r => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )

  type MonthEntry = { days: number[]; amounts: number[] }
  const merchantMap = new Map<string, { months: Map<string, MonthEntry>; category: string }>()

  for (const row of applied) {
    if (!row.merchantName) continue
    if (!merchantMap.has(row.merchantName)) {
      merchantMap.set(row.merchantName, { months: new Map(), category: row.category })
    }
    const entry = merchantMap.get(row.merchantName)!
    if (!entry.months.has(row.monthKey)) {
      entry.months.set(row.monthKey, { days: [], amounts: [] })
    }
    const m = entry.months.get(row.monthKey)!
    m.days.push(row.dayOfMonth)
    m.amounts.push(row.amount)
  }

  const result: {
    merchantName: string
    category: string
    avgAmount: number
    monthCount: number
    dayOfMonth: number
    isManual: boolean
    groupName: string | null
  }[] = []

  for (const [merchantName, data] of merchantMap.entries()) {
    if (dismissed.has(merchantName)) continue
    // Skip if already covered by a manual entry
    if (manual.some(m => m.merchantName === merchantName)) continue

    const monthEntries = Array.from(data.months.values())
    if (monthEntries.length < 2) continue

    let bestDay = 0
    let bestCount = 0

    for (const monthA of monthEntries) {
      for (const dayA of monthA.days) {
        const matchCount = monthEntries.filter(m =>
          m.days.some(d => Math.abs(d - dayA) <= 2)
        ).length
        if (matchCount > bestCount) {
          bestCount = matchCount
          bestDay = dayA
        }
      }
    }

    if (bestCount < 2) continue

    const matchingAmounts = monthEntries
      .filter(m => m.days.some(d => Math.abs(d - bestDay) <= 2))
      .flatMap(m => m.amounts.filter((_, i) => Math.abs(m.days[i] - bestDay) <= 2))

    // Same day-of-month alone is a weak signal — two unrelated charges can
    // coincidentally land within 2 days of each other. Require the matching
    // amounts to also be reasonably consistent (within 3x of each other),
    // otherwise this is very unlikely to be a real recurring charge.
    const minAmount = Math.min(...matchingAmounts)
    const maxAmount = Math.max(...matchingAmounts)
    if (minAmount > 0 && maxAmount / minAmount > 3) continue

    const avgAmount = matchingAmounts.reduce((s, a) => s + a, 0) / matchingAmounts.length

    result.push({ merchantName, category: data.category, avgAmount, monthCount: bestCount, dayOfMonth: bestDay, isManual: false, groupName: null })
  }

  // Merge manual entries (never dismissed)
  for (const m of manual) {
    result.push({
      merchantName: m.merchantName,
      category: m.category,
      avgAmount: m.avgAmount,
      monthCount: 0,
      dayOfMonth: m.dayOfMonth,
      isManual: true,
      groupName: m.groupName ?? null,
    })
  }

  return result.sort((a, b) => b.avgAmount - a.avgAmount)
}

export async function dismissRecurringMerchant(db: DB, merchantName: string): Promise<void> {
  await db.insert(schema.dismissedRecurring).values({ merchantName }).onConflictDoNothing().run()
}

export async function addManualRecurring(db: DB, merchantName: string, dayOfMonth: number, avgAmount: number, category: string): Promise<void> {
  const id = `manual_rec_${Date.now()}`
  await db
    .insert(schema.manualRecurring)
    .values({ id, merchantName, dayOfMonth, avgAmount, category, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: schema.manualRecurring.merchantName,
      set: { dayOfMonth, avgAmount, category },
    })
    .run()
}

export async function deleteManualRecurring(db: DB, merchantName: string): Promise<void> {
  await db.delete(schema.manualRecurring).where(eq(schema.manualRecurring.merchantName, merchantName)).run()
}

export async function updateManualRecurringCategory(db: DB, merchantName: string, category: string): Promise<void> {
  await db.update(schema.manualRecurring).set({ category }).where(eq(schema.manualRecurring.merchantName, merchantName)).run()
}

export async function getCategoryTrendMonths(db: DB, count = 6) {
  const now = new Date()
  // First day of the earliest month we want
  const startDate = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
  const rangeStart = localDateString(startDate)

  const rules = await getMerchantRules(db)

  const rows = await db
    .select({
      year: sql<number>`CAST(strftime('%Y', ${schema.transactions.date}) AS INTEGER)`,
      month: sql<number>`CAST(strftime('%m', ${schema.transactions.date}) AS INTEGER)`,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      merchantName: schema.transactions.merchantName,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, rangeStart),
        sql`(${schema.transactions.amount} > 0 OR (${schema.transactions.amount} < 0 AND ${schema.transactions.customCategory} IS NOT NULL))`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      )
    )
    .groupBy(
      sql`strftime('%Y', ${schema.transactions.date})`,
      sql`strftime('%m', ${schema.transactions.date})`,
      schema.transactions.category,
      schema.transactions.merchantName,
      schema.transactions.customCategory,
    )
    .all()

  const applied = applyCategoryRules(
    rows.map(r => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )

  const months: Array<{ year: number; month: number; label: string; breakdown: Map<string, number> }> = []
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleString('en-CA', { month: 'short' }),
      breakdown: new Map(),
    })
  }

  for (const row of applied) {
    const slot = months.find(m => m.year === row.year && m.month === row.month)
    if (!slot) continue
    slot.breakdown.set(row.category, (slot.breakdown.get(row.category) ?? 0) + row.total)
  }

  return months.map(m => ({
    year: m.year,
    month: m.month,
    label: m.label,
    breakdown: Array.from(m.breakdown.entries()).map(([category, total]) => ({ category, total })),
  }))
}

export async function getCustomCategories(db: DB) {
  return db
    .select()
    .from(schema.customCategories)
    .orderBy(asc(schema.customCategories.name))
    .all()
}

export async function addCustomCategory(db: DB, name: string, color?: string): Promise<void> {
  const slug = slugifyCategory(name)
  if (!slug) return
  const id = `custom_${Date.now()}`
  await db
    .insert(schema.customCategories)
    .values({ id, name: slug, color: color ?? null, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoNothing()
    .run()
}

export async function deleteCustomCategory(db: DB, id: string): Promise<void> {
  await db.delete(schema.customCategories).where(eq(schema.customCategories.id, id)).run()
}

// Registers `category` as a known custom category (so it shows up wherever
// the budget planner / pickers list "known" categories) if it isn't already
// one of the built-ins or already tracked. Called whenever a transaction's
// category is set to something new, regardless of which UI path did it —
// otherwise a category created inline (e.g. via "Create new" on a
// transaction without "apply to all" checked) tracks spend but can never be
// budgeted because it never reaches the custom_categories table.
export async function ensureCustomCategory(db: DB, category: string): Promise<void> {
  const slug = slugifyCategory(category)
  if (!slug || CATEGORY_LABELS[slug]) return
  const existing = await db
    .select({ id: schema.customCategories.id })
    .from(schema.customCategories)
    .where(eq(schema.customCategories.name, slug))
    .get()
  if (!existing) {
    await addCustomCategory(db, slug)
  }
}

// ─── Committed Items ──────────────────────────────────────────────────────────

export async function getCommittedItems(db: DB) {
  return db
    .select()
    .from(schema.committedItems)
    .orderBy(asc(schema.committedItems.createdAt))
    .all()
}

export async function addCommittedItem(
  db: DB,
  name: string,
  type: 'income' | 'expense',
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
): Promise<void> {
  await db.insert(schema.committedItems)
    .values({
      id: crypto.randomUUID(),
      name,
      type,
      expectedAmount,
      category,
      expectedDay: expectedDay ?? null,
      merchantName: merchantName ?? null,
      createdAt: Math.floor(Date.now() / 1000),
    })
    .run()
}

export async function deleteCommittedItem(db: DB, id: string): Promise<void> {
  await db.delete(schema.committedItems)
    .where(eq(schema.committedItems.id, id))
    .run()
}

export type CommittedItemWithStatus = {
  id: string
  name: string
  type: 'income' | 'expense'
  expectedAmount: number
  expectedDay: number | null
  merchantName: string | null
  category: string
  groupName: string | null
  confirmedAmount: number | null
  confirmedCount: number
  confirmedAccountLabel: string | null
}

export async function getCommittedItemsWithStatus(db: DB, year: number, month: number): Promise<CommittedItemWithStatus[]> {
  const { start, end } = monthBounds(year, month)
  const items = await getCommittedItems(db)

  const txs = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      accountName: schema.accounts.name,
      institutionName: schema.items.institutionName,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      )
    )
    .all()

  return items.map((item) => {
    const isIncome = item.type === 'income'
    const isInDirection = (tx: { amount: number }) => isIncome ? tx.amount < 0 : tx.amount > 0
    const txEffectiveCategory = (tx: { category: string; customCategory: string | null }) =>
      tx.customCategory ?? tx.category

    // Step 1: match by category label (the primary signal — the user tags recurring
    // transactions with dedicated labels like "Rent", "Income", "Tax Return").
    const categoryMatched = txs.filter((tx) => {
      if (!isInDirection(tx)) return false
      return txEffectiveCategory(tx) === item.category
    })

    // Step 2: if a keyword is set, use it to narrow the category matches (handles
    // multiple items sharing the same category, e.g. two income sources both labeled
    // "Income"). Fall back to all category matches if keyword filters to zero.
    let matched = categoryMatched
    if (item.merchantName && categoryMatched.length > 0) {
      const kw = item.merchantName.toLowerCase()
      const keywordFiltered = categoryMatched.filter(
        (tx) => tx.merchantName?.toLowerCase().includes(kw) ?? false
      )
      if (keywordFiltered.length > 0) matched = keywordFiltered
    }

    if (matched.length > 0) {
      const total = matched.reduce((s, tx) => s + Math.abs(tx.amount), 0)
      const label = shortAccountLabel(matched[0].accountName ?? '', matched[0].institutionName ?? '')
      return {
        id: item.id,
        name: item.name,
        type: item.type as 'income' | 'expense',
        expectedAmount: item.expectedAmount,
        expectedDay: item.expectedDay,
        merchantName: item.merchantName,
        category: item.category,
        groupName: item.groupName ?? null,
        confirmedAmount: total,
        confirmedCount: matched.length,
        confirmedAccountLabel: label,
      }
    }

    // Step 3: no category match — nothing confirmed this month.
    return {
      id: item.id,
      name: item.name,
      type: item.type as 'income' | 'expense',
      expectedAmount: item.expectedAmount,
      expectedDay: item.expectedDay,
      merchantName: item.merchantName,
      category: item.category,
      groupName: item.groupName ?? null,
      confirmedAmount: null,
      confirmedCount: 0,
      confirmedAccountLabel: null,
    }
  })
}

export type RecurringMerchantWithStatus = {
  merchantName: string
  category: string
  avgAmount: number
  dayOfMonth: number
  isManual: boolean
  groupName: string | null
  confirmedAmount: number | null
  confirmedDate: string | null
  confirmedAccountLabel: string | null
  // True when this charge missed its expected day (plus a grace window) in
  // both the current and previous month — a strong signal the subscription
  // was cancelled. Surfaced so the user notices instead of it sitting as a
  // permanent false "Pending" indefinitely.
  likelyCancelled: boolean
}

async function getRecurringCandidateTxs(db: DB, year: number, month: number) {
  const { start, end } = monthBounds(year, month)
  return db
    .select({
      merchantName: schema.transactions.merchantName,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      accountName: schema.accounts.name,
      institutionName: schema.items.institutionName,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      )
    )
    .all()
}

function findBestRecurringMatch<T extends { merchantName: string | null; amount: number; category: string; customCategory: string | null }>(
  txs: T[],
  m: { category: string; merchantName: string; avgAmount: number },
): T | null {
  const txEffectiveCategory = (tx: { category: string; customCategory: string | null }) =>
    tx.customCategory ?? tx.category

  // Primary: match by category label.
  const categoryMatched = txs.filter((tx) => txEffectiveCategory(tx) === m.category)

  // Tiebreaker: if keyword is set and multiple category matches exist, narrow by name.
  let pool = categoryMatched
  if (categoryMatched.length > 0 && m.merchantName) {
    const kw = m.merchantName.toLowerCase()
    const nameFiltered = categoryMatched.filter(
      (tx) => tx.merchantName?.toLowerCase().includes(kw) ?? false
    )
    if (nameFiltered.length > 0) pool = nameFiltered
  }

  return pool.sort((a, b) =>
    Math.abs(a.amount - m.avgAmount) - Math.abs(b.amount - m.avgAmount)
  )[0] ?? null
}

export async function getRecurringMerchantsWithStatus(db: DB, year: number, month: number): Promise<RecurringMerchantWithStatus[]> {
  const merchants = await getRecurringMerchants(db)

  // Load group assignments for auto-detected merchants
  const groupRows = await db.select().from(schema.recurringMerchantGroups).all()
  const groupMap = new Map(groupRows.map((r) => [r.merchantName, r.groupName]))

  const txs = await getRecurringCandidateTxs(db, year, month)

  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const today = now.getDate()

  // Only fetched lazily, and only for non-manual merchants, since this is
  // purely to detect "missed two months in a row" — manual entries are
  // user-asserted and shouldn't be second-guessed.
  let prevMonthTxs: Awaited<ReturnType<typeof getRecurringCandidateTxs>> | null = null

  return await Promise.all(merchants.map(async (m) => {
    const best = findBestRecurringMatch(txs, m)

    const groupName = m.isManual
      ? (m.groupName ?? null)
      : (groupMap.get(m.merchantName) ?? null)

    // A charge is "likely cancelled" once it's missed its expected day (plus
    // a week's grace for date drift) in the current month AND the previous
    // month also has no match — a single missed month is too common (timing,
    // a pending charge not yet posted) to flag.
    let likelyCancelled = false
    if (!m.isManual && best === null && isCurrentMonth && today > m.dayOfMonth + 7) {
      if (prevMonthTxs === null) {
        const prevDate = new Date(year, month - 2, 1)
        prevMonthTxs = await getRecurringCandidateTxs(db, prevDate.getFullYear(), prevDate.getMonth() + 1)
      }
      likelyCancelled = findBestRecurringMatch(prevMonthTxs, m) === null
    }

    return {
      merchantName: m.merchantName,
      category: m.category,
      avgAmount: m.avgAmount,
      dayOfMonth: m.dayOfMonth,
      isManual: m.isManual,
      groupName,
      confirmedAmount: best ? best.amount : null,
      confirmedDate: best ? best.date : null,
      confirmedAccountLabel: best
        ? shortAccountLabel(best.accountName ?? '', best.institutionName ?? '')
        : null,
      likelyCancelled,
    }
  }))
}

export async function setCommittedItemGroup(db: DB, id: string, groupName: string | null): Promise<void> {
  await db.update(schema.committedItems)
    .set({ groupName: groupName ?? null })
    .where(eq(schema.committedItems.id, id))
    .run()
}

export async function setManualRecurringGroup(db: DB, merchantName: string, groupName: string | null): Promise<void> {
  await db.update(schema.manualRecurring)
    .set({ groupName: groupName ?? null })
    .where(eq(schema.manualRecurring.merchantName, merchantName))
    .run()
}

export async function setAutoRecurringGroup(db: DB, merchantName: string, groupName: string | null): Promise<void> {
  if (groupName === null) {
    await db.delete(schema.recurringMerchantGroups)
      .where(eq(schema.recurringMerchantGroups.merchantName, merchantName))
      .run()
  } else {
    await db.insert(schema.recurringMerchantGroups)
      .values({ merchantName, groupName })
      .onConflictDoUpdate({
        target: schema.recurringMerchantGroups.merchantName,
        set: { groupName },
      })
      .run()
  }
}
