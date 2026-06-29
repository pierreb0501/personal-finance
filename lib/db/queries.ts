import { desc, eq, and, gte, lt, gt, or, sql, asc, inArray } from 'drizzle-orm'
import * as schema from './schema'
import type { DB } from './index'
import { applyCategoryRules, slugifyCategory, CATEGORY_LABELS, CARD_PAYMENT_CATEGORY, type CategoryRule } from '@/lib/categories'
import { expandAmortized, type YearMonth } from '@/lib/amortize'

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
    .where(eq(schema.accounts.type, 'credit'))
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
    .select({ id: schema.items.id, institutionName: schema.items.institutionName, errorCode: schema.items.errorCode })
    .from(schema.items)
    .where(eq(schema.items.status, 'login_required'))
    .all()
}

export async function getAllItemsWithAccounts(db: DB) {
  const itemRows = await db
    .select()
    .from(schema.items)
    .orderBy(asc(schema.items.institutionName))
    .all()

  const accountRows = await getAllAccounts(db)

  return itemRows.map((item) => ({
    id: item.id,
    institutionName: item.institutionName,
    status: item.status,
    errorCode: item.errorCode,
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

// ─── Credit-card payment detection ──────────────────────────────────────────
// A credit-card payment is a transfer between your own accounts — never spend or
// income. Plaid emits two legs we detect structurally (no cross-account matching):
//   • Outflow leg — money leaving a depository account to pay the card. Plaid
//     tags it LOAN_PAYMENTS_CREDIT_CARD_PAYMENT, its one reliable signal.
//   • Inflow leg — the credit landing on the card. Plaid mislabels this
//     (INCOME, TRANSFER_IN, …), so we identify it by *where it lands*: any credit
//     on a credit-type account categorised as income/transfer/loan-payment.
// A manual customCategory always wins (the user explicitly re-labelled the row);
// to force-exclude a payment Plaid missed, mark the transaction ignored.

// Primary categories an inflow can carry and still be a credit-card payment (vs a
// store refund, which carries a spend category). Exported so the sync layer can use
// the exact same set when deciding whether a merchantless inflow must stay nameless
// to preserve card-payment detection — keeping the two in lockstep.
export const CARD_PAYMENT_INFLOW_CATEGORIES = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])

// SQL predicate for "exclude this row from spend as a card payment" — covers the
// manual force-on marker (either leg) and the auto-detected outflow. (The auto
// inflow is amount < 0 with no customCategory, which spend aggregates already drop.)
// Spend aggregates run on the transactions table alone, no account join. Returns a
// fresh fragment per call so it can be embedded in multiple queries safely.
function excludedAsCardPayment() {
  // NULL-safe: `customCategory = 'CARD_PAYMENT'` yields NULL (not false) when
  // customCategory IS NULL, and that NULL propagates through the surrounding
  // `NOT (...)`, wrongly filtering out every un-labelled row. Guard with IS NOT NULL.
  return sql`((${schema.transactions.customCategory} IS NOT NULL AND ${schema.transactions.customCategory} = ${CARD_PAYMENT_CATEGORY}) OR (${schema.transactions.categoryDetailed} = 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' AND ${schema.transactions.customCategory} IS NULL))`
}

// Full spend-inclusion predicate: outflows plus user-labelled inflows that offset
// a category, minus credit-card payments. Shared by every spend aggregate so the
// rule can't drift between them.
function spendInclusion() {
  return sql`(${schema.transactions.amount} > 0 OR (${schema.transactions.amount} < 0 AND ${schema.transactions.customCategory} IS NOT NULL)) AND NOT ${excludedAsCardPayment()}`
}

// ─── Accrual amortization (analytics overlay) ───────────────────────────────
// A handful of postings are spread over multiple months (spread_months > 1) so
// accrual surfaces (trends, savings rate, budget) show an even monthly slice
// instead of one spike. Cash surfaces must NOT use this. The pattern at every
// accrual call site: keep the existing SQL sum but restrict it to non-amortized
// rows via notAmortized(), then overlay the expanded slices from
// selectAmortizedRows(). The slice math lives once in lib/amortize.ts.

// SQL predicate: this row books entirely in its posting month (normal behaviour).
function notAmortized() {
  return sql`(${schema.transactions.spreadMonths} IS NULL OR ${schema.transactions.spreadMonths} <= 1)`
}

type AmortizedRow = {
  date: string
  amount: number
  spreadMonths: number | null
  category: string
  categoryDetailed: string | null
  customCategory: string | null
  merchantName: string | null
  accountType: string | null
}

// All amortized postings (spread_months > 1), posted and not ignored, with the
// account type needed for card-payment detection. There are few of these, so we
// fetch them all and let expandAmortized clip to each surface's window.
async function selectAmortizedRows(db: DB): Promise<AmortizedRow[]> {
  return db
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      spreadMonths: schema.transactions.spreadMonths,
      category: schema.transactions.category,
      categoryDetailed: schema.transactions.categoryDetailed,
      customCategory: schema.transactions.customCategory,
      merchantName: schema.transactions.merchantName,
      accountType: schema.accounts.type,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(
      and(
        gt(schema.transactions.spreadMonths, 1),
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      ),
    )
    .all()
}

// Overlay accrual SPEND slices from amortized rows. Mirrors spendInclusion() (an
// outflow, or a labelled inflow that offsets a category) minus card payments,
// keyed on the post-relabel category — exactly what the spend aggregates use.
function addAmortizedSpend(
  rows: AmortizedRow[],
  ruleMap: Map<string, string>,
  rangeStart: YearMonth,
  rangeEnd: YearMonth,
  add: (year: number, month: number, category: string, amount: number) => void,
) {
  for (const row of rows) {
    const included = (row.amount > 0 || (row.amount < 0 && !!row.customCategory)) && !isCardPayment(row)
    if (!included) continue
    const category =
      row.customCategory ?? (row.merchantName ? ruleMap.get(row.merchantName) : undefined) ?? row.category
    for (const sl of expandAmortized(row, rangeStart, rangeEnd)) {
      add(sl.year, sl.month, category, sl.amount)
    }
  }
}

// Overlay accrual INCOME slices from amortized rows. Mirrors getIncomeTrendMonths'
// definition of income (effective category is a known income category OR Plaid's
// original category is INCOME) minus card payments. Slices are added as positive
// income figures (inflows are stored negative).
function addAmortizedIncome(
  rows: AmortizedRow[],
  ruleMap: Map<string, string>,
  incomeCats: Set<string>,
  rangeStart: YearMonth,
  rangeEnd: YearMonth,
  add: (year: number, month: number, category: string, amount: number) => void,
) {
  for (const row of rows) {
    if (row.amount >= 0 || isCardPayment(row)) continue
    const category =
      row.customCategory ?? (row.merchantName ? ruleMap.get(row.merchantName) : undefined) ?? row.category
    if (!(incomeCats.has(category) || row.category === 'INCOME')) continue
    for (const sl of expandAmortized(row, rangeStart, rangeEnd)) {
      add(sl.year, sl.month, category, -sl.amount)
    }
  }
}

// JS mirror of the detection, for code paths that reconcile in memory (committed
// income/expense matching). Catches both legs so a payment is never counted as
// confirmed income or expense. Manual override wins in both directions: the
// reserved CARD_PAYMENT marker forces on; any other customCategory forces off.
function isCardPayment(tx: {
  amount: number
  category: string
  categoryDetailed: string | null
  customCategory: string | null
  merchantName: string | null
  accountType: string | null
}): boolean {
  if (tx.customCategory === CARD_PAYMENT_CATEGORY) return true
  if (tx.customCategory) return false
  if (tx.categoryDetailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT') return true
  // Inflow leg: a credit landing on a credit-type account. A real payment comes
  // from your bank and carries no merchant; a refund comes from a store and keeps
  // a merchant (and usually a spend category). Requiring "no merchant" here means
  // a refund is never mistaken for a payment, even if Plaid mis-tags it as
  // income/transfer.
  return (
    tx.accountType === 'credit' &&
    tx.amount < 0 &&
    !tx.merchantName &&
    CARD_PAYMENT_INFLOW_CATEGORIES.has(tx.category)
  )
}

export async function getMonthlySpend(db: DB, year?: number, month?: number): Promise<number> {
  const { start, end } = monthBounds(year, month)
  const result = await db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        // Include regular expenses AND labeled transfer-ins (which reduce spend),
        // excluding credit-card payment outflows (transfers, not spend).
        spendInclusion(),
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
        // Exclude credit-card payments (transfers, not spend).
        sql`NOT ${excludedAsCardPayment()}`,
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

// Spend per category for a month. Default is cash (every posting books in its
// month). With { accrual: true } amortized postings are spread instead: excluded
// from the SQL sum and overlaid as this month's even slice — used by the budget
// page so a lumpy semi-annual/annual bill doesn't blow one month's actuals.
export async function getCategoryBreakdown(
  db: DB,
  year?: number,
  month?: number,
  opts: { accrual?: boolean } = {},
) {
  const { start, end } = monthBounds(year, month)
  const rules = await getMerchantRules(db)

  const where = [
    gte(schema.transactions.date, start),
    sql`${schema.transactions.date} <= ${end}`,
    // Include regular expenses AND labeled transfer-ins (deducted from their
    // category), excluding credit-card payment outflows (transfers, not spend).
    spendInclusion(),
    eq(schema.transactions.pending, 0),
    eq(schema.transactions.ignored, 0),
  ]
  // In accrual mode amortized rows are spread via the overlay below, so keep them
  // out of the posting-month SQL sum.
  if (opts.accrual) where.push(notAmortized())

  const rows = await db
    .select({
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      merchantName: schema.transactions.merchantName,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(and(...where))
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

  if (opts.accrual) {
    const now = new Date()
    const ym = { year: year ?? now.getFullYear(), month: month ?? now.getMonth() + 1 }
    const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))
    addAmortizedSpend(await selectAmortizedRows(db), ruleMap, ym, ym, (_y, _m, category, amount) => {
      agg.set(category, (agg.get(category) ?? 0) + amount)
    })
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
      categoryDetailed: schema.transactions.categoryDetailed,
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
    rows.map((r) => ({
      ...r,
      merchantName: r.merchantName ?? null,
      customCategory: r.customCategory ?? null,
      // amount > 0 here, so only the outflow leg can match (accountType irrelevant).
      isCardPayment: isCardPayment({ ...r, customCategory: r.customCategory ?? null, merchantName: r.merchantName ?? null, accountType: null }),
    })),
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
      categoryDetailed: schema.transactions.categoryDetailed,
      customCategory: schema.transactions.customCategory,
      pending: schema.transactions.pending,
      ignored: schema.transactions.ignored,
      spreadMonths: schema.transactions.spreadMonths,
      accountName: schema.accounts.name,
      accountType: schema.accounts.type,
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
      isCardPayment: isCardPayment({ ...r, customCategory: r.customCategory ?? null, merchantName: r.merchantName ?? null }),
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

// Set (or clear) the accrual amortization window for a transaction. months <= 1
// clears it (stored as NULL → books in the posting month). Affects accrual
// surfaces only (trends, budget); the raw posting is never altered.
export async function setTransactionSpread(db: DB, txId: string, months: number): Promise<void> {
  const value = Number.isFinite(months) && months > 1 ? Math.floor(months) : null
  await db.update(schema.transactions)
    .set({ spreadMonths: value })
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
    autoAverage: boolean
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

    result.push({ merchantName, category: data.category, avgAmount, monthCount: bestCount, dayOfMonth: bestDay, isManual: false, groupName: null, autoAverage: false })
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
      autoAverage: !!m.autoAverage,
    })
  }

  return result.sort((a, b) => b.avgAmount - a.avgAmount)
}

export async function dismissRecurringMerchant(db: DB, merchantName: string): Promise<void> {
  await db.insert(schema.dismissedRecurring).values({ merchantName }).onConflictDoNothing().run()
}

export async function addManualRecurring(db: DB, merchantName: string, dayOfMonth: number, avgAmount: number, category: string, autoAverage?: boolean): Promise<void> {
  const id = `manual_rec_${Date.now()}`
  const auto = autoAverage ? 1 : 0
  await db
    .insert(schema.manualRecurring)
    .values({ id, merchantName, dayOfMonth, avgAmount, category, createdAt: Math.floor(Date.now() / 1000), autoAverage: auto })
    .onConflictDoUpdate({
      target: schema.manualRecurring.merchantName,
      set: { dayOfMonth, avgAmount, category, autoAverage: auto },
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
        spendInclusion(),
        notAmortized(),
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

  const addToMonth = (year: number, month: number, category: string, amount: number) => {
    const slot = months.find(m => m.year === year && m.month === month)
    if (!slot) return
    slot.breakdown.set(category, (slot.breakdown.get(category) ?? 0) + amount)
  }

  for (const row of applied) addToMonth(row.year, row.month, row.category, row.total)

  // Accrual overlay: amortized postings (excluded from the SQL sum above) spread
  // across the window as even monthly slices.
  const rangeStartYM = { year: months[0].year, month: months[0].month }
  const rangeEndYM = { year: months[months.length - 1].year, month: months[months.length - 1].month }
  const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))
  addAmortizedSpend(await selectAmortizedRows(db), ruleMap, rangeStartYM, rangeEndYM, addToMonth)

  return months.map(m => ({
    year: m.year,
    month: m.month,
    label: m.label,
    breakdown: Array.from(m.breakdown.entries()).map(([category, total]) => ({ category, total })),
  }))
}

// Income counterpart to getCategoryTrendMonths. The spend trend can't be reused
// for income: it runs spendInclusion(), which drops every unlabelled inflow (so
// raw Plaid salary never shows), and it keys on the post-relabel category (so
// income relabelled to a custom bucket like "Parents" falls outside the income
// set). Here we look at inflows directly and call a row income when its effective
// category is a known income category OR Plaid's original category is INCOME —
// the latter catches relabelled paycheques. Card-payment inflow legs (Plaid
// mislabels them INCOME) are filtered out structurally via isCardPayment.
export async function getIncomeTrendMonths(db: DB, count = 6) {
  const now = new Date()
  const startDate = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
  const rangeStart = localDateString(startDate)

  const [rules, incomeCats] = await Promise.all([
    getMerchantRules(db),
    getIncomeCategories(db),
  ])
  const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))

  const rows = await db
    .select({
      date: schema.transactions.date,
      amount: schema.transactions.amount,
      category: schema.transactions.category,
      categoryDetailed: schema.transactions.categoryDetailed,
      customCategory: schema.transactions.customCategory,
      merchantName: schema.transactions.merchantName,
      accountType: schema.accounts.type,
    })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(
      and(
        gte(schema.transactions.date, rangeStart),
        lt(schema.transactions.amount, 0),
        notAmortized(),
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      )
    )
    .all()

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

  const addToMonth = (year: number, month: number, category: string, amount: number) => {
    const slot = months.find((m) => m.year === year && m.month === month)
    if (!slot) return
    slot.breakdown.set(category, (slot.breakdown.get(category) ?? 0) + amount)
  }

  for (const row of rows) {
    if (isCardPayment(row)) continue
    const effCategory =
      row.customCategory ?? (row.merchantName ? ruleMap.get(row.merchantName) : undefined) ?? row.category
    const isIncome = incomeCats.has(effCategory) || row.category === 'INCOME'
    if (!isIncome) continue
    const year = Number(row.date.slice(0, 4))
    const month = Number(row.date.slice(5, 7))
    // Inflows are stored negative; flip to a positive income figure.
    addToMonth(year, month, effCategory, -row.amount)
  }

  // Accrual overlay: amortized income postings spread across the window.
  const rangeStartYM = { year: months[0].year, month: months[0].month }
  const rangeEndYM = { year: months[months.length - 1].year, month: months[months.length - 1].month }
  addAmortizedIncome(await selectAmortizedRows(db), ruleMap, incomeCats, rangeStartYM, rangeEndYM, addToMonth)

  return months.map((m) => ({
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

// Merchant rules + custom categories, plus the union of their category names —
// almost every page needs both the raw rules (to pass to category pickers)
// and the deduped name list (to know what's "known").
export async function getKnownCategories(db: DB): Promise<{ rules: CategoryRule[]; knownCustomCategories: string[] }> {
  const rules = await getMerchantRules(db)
  const customCats = await getCustomCategories(db)
  // Slugify before deduping so legacy raw-name categories ("Rent") and their
  // canonical slug ("RENT") collapse to one entry — otherwise both surface as
  // twin "Rent" options in the pickers (they render to the same label).
  const knownCustomCategories = [...new Set([
    ...rules.map((r) => slugifyCategory(r.category)),
    ...customCats.map((c) => slugifyCategory(c.name)),
  ].filter(Boolean))]
  return { rules, knownCustomCategories }
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
  const cat = await db
    .select({ name: schema.customCategories.name })
    .from(schema.customCategories)
    .where(eq(schema.customCategories.id, id))
    .get()

  await db.delete(schema.customCategories).where(eq(schema.customCategories.id, id)).run()
  if (!cat) return

  // Clean up everything that referenced the label, otherwise it lingers on data
  // after its definition is gone: transactions keep showing it, merchant rules
  // keep re-applying it, and orphaned budget/label rows survive. Reverting a
  // transaction's customCategory to NULL drops it back to its Plaid category
  // (and re-enables credit-card-payment auto-detection on those rows).
  await db.update(schema.transactions).set({ customCategory: null }).where(eq(schema.transactions.customCategory, cat.name)).run()
  await db.delete(schema.categoryRules).where(eq(schema.categoryRules.category, cat.name)).run()
  await db.delete(schema.categoryBudgets).where(eq(schema.categoryBudgets.category, cat.name)).run()
  await db.delete(schema.categoryLabels).where(eq(schema.categoryLabels.category, cat.name)).run()
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
  // CARD_PAYMENT is a reserved override marker, not a budgetable custom category.
  if (!slug || slug === CARD_PAYMENT_CATEGORY || CATEGORY_LABELS[slug]) return
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
  intervalMonths?: number,
  anchorYear?: number,
  anchorMonth?: number,
  autoAverage?: boolean,
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
      intervalMonths: intervalMonths ?? 1,
      anchorYear: anchorYear ?? null,
      anchorMonth: anchorMonth ?? null,
      autoAverage: autoAverage ? 1 : 0,
    })
    .run()
}

export async function updateCommittedItem(
  db: DB,
  id: string,
  fields: {
    name: string
    expectedAmount: number
    category: string
    expectedDay: number | null
    merchantName: string | null
    intervalMonths: number
    anchorYear: number | null
    anchorMonth: number | null
    autoAverage: number
  },
): Promise<void> {
  await db.update(schema.committedItems)
    .set(fields)
    .where(eq(schema.committedItems.id, id))
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
  // For auto-average items this is the trailing-12-month average (falling back to
  // the stored fixed amount when there's no history yet); otherwise the fixed
  // amount the user entered.
  expectedAmount: number
  // The raw stored amount the user entered — the fixed value, or the fallback for
  // auto-average items. Surfaced so the edit form seeds from the stored value
  // rather than the computed average.
  fixedAmount: number
  autoAverage: boolean
  expectedDay: number | null
  merchantName: string | null
  category: string
  groupName: string | null
  intervalMonths: number
  anchorYear: number | null
  anchorMonth: number | null
  confirmedAmount: number | null
  confirmedCount: number
  confirmedAccountLabel: string | null
}

type CommittedCandidateTx = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  categoryDetailed: string | null
  customCategory: string | null
  accountName: string | null
  accountType: string | null
  institutionName: string | null
}

async function selectCommittedCandidateTxs(db: DB, start: string, end: string): Promise<CommittedCandidateTx[]> {
  const rows = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      date: schema.transactions.date,
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      categoryDetailed: schema.transactions.categoryDetailed,
      customCategory: schema.transactions.customCategory,
      accountName: schema.accounts.name,
      accountType: schema.accounts.type,
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
  // Credit-card payment legs are transfers — never confirmed income or expense.
  return rows.filter((tx) => !isCardPayment(tx))
}

// Shared category-then-keyword matcher: match by category label first (the primary
// signal — users tag recurring transactions with labels like "Rent" or "Income"),
// then narrow by keyword when set (disambiguates items sharing a category, e.g. two
// income sources both labeled "Income"); fall back to all category matches if the
// keyword filters to zero.
function matchCommittedTxs<T extends { amount: number; merchantName: string | null; category: string; customCategory: string | null }>(
  item: { type: string; category: string; merchantName: string | null },
  txs: T[],
): T[] {
  const isIncome = item.type === 'income'
  const isInDirection = (tx: { amount: number }) => isIncome ? tx.amount < 0 : tx.amount > 0
  const effCategory = (tx: { category: string; customCategory: string | null }) => tx.customCategory ?? tx.category

  const categoryMatched = txs.filter((tx) => isInDirection(tx) && effCategory(tx) === item.category)
  if (!item.merchantName || categoryMatched.length === 0) return categoryMatched

  const kw = item.merchantName.toLowerCase()
  const keywordFiltered = categoryMatched.filter((tx) => tx.merchantName?.toLowerCase().includes(kw) ?? false)
  return keywordFiltered.length > 0 ? keywordFiltered : categoryMatched
}

// Average of per-month totals over the matched history. Months with no matching
// transaction are excluded, so a gap (or a quarterly cadence) doesn't deflate the
// figure — this yields the typical amount per occurrence-month. Null when there's
// no history to average.
function trailingMonthlyAverage(
  item: { type: string; category: string; merchantName: string | null },
  histTxs: CommittedCandidateTx[],
): number | null {
  const matched = matchCommittedTxs(item, histTxs)
  if (matched.length === 0) return null
  const byMonth = new Map<string, number>()
  for (const tx of matched) {
    const key = tx.date.slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + Math.abs(tx.amount))
  }
  const sums = [...byMonth.values()]
  return sums.reduce((s, a) => s + a, 0) / sums.length
}

function isItemDueInMonth(
  item: { intervalMonths: number; anchorYear: number | null; anchorMonth: number | null },
  year: number,
  month: number,
): boolean {
  if (item.intervalMonths <= 1) return true
  if (item.anchorYear === null || item.anchorMonth === null) return true
  const diff = (year * 12 + month) - (item.anchorYear * 12 + item.anchorMonth)
  return diff >= 0 && diff % item.intervalMonths === 0
}

export async function getCommittedItemsWithStatus(db: DB, year: number, month: number): Promise<CommittedItemWithStatus[]> {
  const { start, end } = monthBounds(year, month)
  const allItems = await getCommittedItems(db)
  const items = allItems.filter((item) => isItemDueInMonth(item, year, month))

  const txs = await selectCommittedCandidateTxs(db, start, end)

  // Trailing-12-month history is only needed for auto-average items, so fetch it
  // lazily. Window: 12 months ending with (and including) the viewed month. A
  // charge that has already posted this month is counted; a month with no posted
  // match contributes nothing, so an as-yet-unbilled current month doesn't drag
  // the average down.
  let histTxs: CommittedCandidateTx[] = []
  if (items.some((item) => item.autoAverage)) {
    const histStart = localDateString(new Date(year, month - 1 - 11, 1))
    histTxs = await selectCommittedCandidateTxs(db, histStart, end)
  }

  return items.map((item) => {
    const matched = matchCommittedTxs(item, txs)

    // Displayed expected amount: trailing-12-month average for auto-average items
    // (falling back to the stored fixed amount when there's no history yet),
    // otherwise the fixed amount the user entered.
    const autoAverage = !!item.autoAverage
    const averaged = autoAverage ? trailingMonthlyAverage(item, histTxs) : null
    const expectedAmount = averaged ?? item.expectedAmount

    const base = {
      id: item.id,
      name: item.name,
      type: item.type as 'income' | 'expense',
      expectedAmount,
      fixedAmount: item.expectedAmount,
      autoAverage,
      expectedDay: item.expectedDay,
      merchantName: item.merchantName,
      category: item.category,
      groupName: item.groupName ?? null,
      intervalMonths: item.intervalMonths,
      anchorYear: item.anchorYear,
      anchorMonth: item.anchorMonth,
    }

    if (matched.length > 0) {
      const total = matched.reduce((s, tx) => s + Math.abs(tx.amount), 0)
      const label = shortAccountLabel(matched[0].accountName ?? '', matched[0].institutionName ?? '')
      return { ...base, confirmedAmount: total, confirmedCount: matched.length, confirmedAccountLabel: label }
    }
    return { ...base, confirmedAmount: null, confirmedCount: 0, confirmedAccountLabel: null }
  })
}

export type RecurringMerchantWithStatus = {
  merchantName: string
  category: string
  // For auto-average manual charges this is the trailing-12-month average
  // (falling back to fixedAmount when there's no history); for auto-detected
  // charges it's the detection average; for fixed manual charges it's the set value.
  avgAmount: number
  // The raw stored amount on a manual charge — the fixed value, or the fallback
  // for auto-average. Surfaced so the edit form seeds from the stored value.
  fixedAmount: number
  autoAverage: boolean
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

  // For auto-average manual charges, the displayed amount is the trailing-12-month
  // average of the merchant's transactions (mirrors committed-item auto-average).
  // Computed once as merchant -> average of per-month sums over months with data.
  let histByMerchant: Map<string, number> | null = null
  if (merchants.some((m) => m.isManual && m.autoAverage)) {
    const { end } = monthBounds(year, month)
    const histStart = localDateString(new Date(year, month - 1 - 11, 1))
    const histRows = await db
      .select({ merchantName: schema.transactions.merchantName, amount: schema.transactions.amount, date: schema.transactions.date })
      .from(schema.transactions)
      .where(and(
        gte(schema.transactions.date, histStart),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
        sql`${schema.transactions.merchantName} IS NOT NULL`,
      ))
      .all()
    const perMerchantMonth = new Map<string, Map<string, number>>()
    for (const r of histRows) {
      if (!r.merchantName) continue
      if (!perMerchantMonth.has(r.merchantName)) perMerchantMonth.set(r.merchantName, new Map())
      const mm = perMerchantMonth.get(r.merchantName)!
      const mk = r.date.slice(0, 7)
      mm.set(mk, (mm.get(mk) ?? 0) + Math.abs(r.amount))
    }
    histByMerchant = new Map()
    for (const [mn, mm] of perMerchantMonth) {
      const sums = [...mm.values()]
      histByMerchant.set(mn, sums.reduce((s, a) => s + a, 0) / sums.length)
    }
  }

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

    const avgAmount = (m.isManual && m.autoAverage)
      ? (histByMerchant?.get(m.merchantName) ?? m.avgAmount)
      : m.avgAmount

    return {
      merchantName: m.merchantName,
      category: m.category,
      avgAmount,
      fixedAmount: m.avgAmount,
      autoAverage: m.autoAverage,
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

// ─── Calendar ────────────────────────────────────────────────────────────────

export type CalendarTxEntry = Awaited<ReturnType<typeof getTransactionsForMonth>>[number]

export type CalendarExpectedEntry = {
  id: string
  name: string
  amount: number
  type: 'income' | 'expense'
  category: string
  source: 'committed' | 'recurring'
}

export type CalendarDay = {
  date: string
  netTotal: number
  actual: CalendarTxEntry[]
  expected: CalendarExpectedEntry[]
}

export type CalendarMonth = {
  days: CalendarDay[]
  maxAbsNetTotal: number
}

function dateForDay(year: number, month: number, day: number, daysInMonth: number): string {
  const clamped = Math.min(day, daysInMonth)
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

export async function getCalendarMonth(db: DB, year: number, month: number): Promise<CalendarMonth> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayStr = localDateString(new Date())

  const dayMap = new Map<string, CalendarDay>()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = dateForDay(year, month, d, daysInMonth)
    dayMap.set(date, { date, netTotal: 0, actual: [], expected: [] })
  }

  // Actual entries — getTransactionsForMonth excludes pending but not
  // ignored transactions, so filter those out here too.
  const txs = (await getTransactionsForMonth(db, year, month)).filter((tx) => !tx.ignored)
  for (const tx of txs) {
    const day = dayMap.get(tx.date)
    if (!day) continue
    day.actual.push(tx)
    day.netTotal += -tx.amount
  }

  // Expected entries — only for days not already in the past, and only
  // for items that haven't posted (confirmedAmount === null) this month.
  const committedItems = await getCommittedItemsWithStatus(db, year, month)
  for (const item of committedItems) {
    if (item.confirmedAmount !== null) continue
    if (item.expectedDay === null) continue
    const date = dateForDay(year, month, item.expectedDay, daysInMonth)
    if (date < todayStr) continue
    dayMap.get(date)?.expected.push({
      id: item.id,
      name: item.name,
      amount: item.expectedAmount,
      type: item.type,
      category: item.category,
      source: 'committed',
    })
  }

  const recurringMerchants = await getRecurringMerchantsWithStatus(db, year, month)
  for (const m of recurringMerchants) {
    if (m.confirmedAmount !== null) continue
    if (m.likelyCancelled) continue
    const date = dateForDay(year, month, m.dayOfMonth, daysInMonth)
    if (date < todayStr) continue
    dayMap.get(date)?.expected.push({
      id: `recurring-${m.merchantName}`,
      name: m.merchantName,
      amount: m.avgAmount,
      type: 'expense',
      category: m.category,
      source: 'recurring',
    })
  }

  const days = Array.from(dayMap.values())
  const maxAbsNetTotal = days.reduce((max, d) => Math.max(max, Math.abs(d.netTotal)), 0)

  return { days, maxAbsNetTotal }
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

// ─── Login rate limiting ──────────────────────────────────────────────────────

const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const LOGIN_ATTEMPT_MAX = 8

export type LoginRateLimitStatus =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number }

// Returns whether `ip` is currently allowed to attempt a login, and if not,
// how many seconds remain in the lockout window (so the UI can show a
// countdown). Does not itself record an attempt — call
// recordFailedLoginAttempt() after a failed password check.
export async function isLoginRateLimited(db: DB, ip: string): Promise<LoginRateLimitStatus> {
  const row = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip)).get()
  if (!row) return { limited: false }

  const elapsedMs = Date.now() - row.windowStart
  if (elapsedMs > LOGIN_ATTEMPT_WINDOW_MS) return { limited: false }
  if (row.count < LOGIN_ATTEMPT_MAX) return { limited: false }

  const retryAfterSeconds = Math.max(0, Math.ceil((LOGIN_ATTEMPT_WINDOW_MS - elapsedMs) / 1000))
  return { limited: true, retryAfterSeconds }
}

export async function recordFailedLoginAttempt(db: DB, ip: string): Promise<void> {
  const now = Date.now()
  const row = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip)).get()
  const windowExpired = !row || now - row.windowStart > LOGIN_ATTEMPT_WINDOW_MS

  await db.insert(schema.loginAttempts)
    .values({ ip, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: schema.loginAttempts.ip,
      set: windowExpired
        ? { count: 1, windowStart: now }
        : { count: sql`${schema.loginAttempts.count} + 1` },
    })
    .run()
}

export async function clearLoginAttempts(db: DB, ip: string): Promise<void> {
  await db.delete(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip)).run()
}

// ─── Category Labels ──────────────────────────────────────────────────────────

export type CategoryKind = 'fixed' | 'flexible' | 'savings'

export async function getCategoryLabels(db: DB): Promise<Map<string, CategoryKind>> {
  const rows = await db.select().from(schema.categoryLabels).all()
  return new Map(rows.map((r) => [r.category, r.kind as CategoryKind]))
}

export async function setCategoryLabel(db: DB, category: string, kind: CategoryKind): Promise<void> {
  await db.insert(schema.categoryLabels)
    .values({ category, kind })
    .onConflictDoUpdate({ target: schema.categoryLabels.category, set: { kind } })
    .run()
}

// Category names that represent income, so they're excluded from spend/budget buckets.
// Used by getBudgetSummary and by the budget page (to hide income categories from the plan).
export async function getIncomeCategories(db: DB): Promise<Set<string>> {
  const rows = await db.select({ category: schema.committedItems.category })
    .from(schema.committedItems)
    .where(eq(schema.committedItems.type, 'income'))
    .all()
  const s = new Set(rows.map((r) => r.category))
  s.add('INCOME') // built-in Plaid income category
  return s
}

// ─── Budget Summary ───────────────────────────────────────────────────────────

export type BudgetSummary = {
  totalBudget: number; billsBudget: number; flexibleBudget: number; savingsBudget: number
  totalSpent: number; flexibleSpent: number; flexibleRemaining: number
  unbudgetedSpend: number; unbudgetedCount: number
}

export async function getBudgetSummary(
  db: DB,
  year: number,
  month: number,
  opts: { accrual?: boolean } = {},
): Promise<BudgetSummary> {
  const [budgets, breakdown, labels, income] = await Promise.all([
    getCategoryBudgets(db, year, month),
    getCategoryBreakdown(db, year, month, opts),
    getCategoryLabels(db),
    getIncomeCategories(db),
  ])
  const kindOf = (c: string): CategoryKind => labels.get(c) ?? 'flexible'

  const budgetRows = budgets.filter((b) => !income.has(b.category))
  const spendRows = breakdown.filter((c) => !income.has(c.category) && c.total > 0)
  const plannedCats = new Set(budgetRows.map((b) => b.category))

  let totalBudget = 0, billsBudget = 0, flexibleBudget = 0, savingsBudget = 0
  for (const b of budgetRows) {
    totalBudget += b.planned
    const k = kindOf(b.category)
    if (k === 'fixed') billsBudget += b.planned
    else if (k === 'savings') savingsBudget += b.planned
    else flexibleBudget += b.planned
  }

  let totalSpent = 0, flexibleSpent = 0, unbudgetedSpend = 0, unbudgetedCount = 0
  for (const c of spendRows) {
    totalSpent += c.total
    if (kindOf(c.category) === 'flexible') flexibleSpent += c.total
    if (!plannedCats.has(c.category)) { unbudgetedSpend += c.total; unbudgetedCount += 1 }
  }

  return {
    totalBudget, billsBudget, flexibleBudget, savingsBudget,
    totalSpent, flexibleSpent, flexibleRemaining: flexibleBudget - flexibleSpent,
    unbudgetedSpend, unbudgetedCount,
  }
}

// ─── Investment Transactions ──────────────────────────────────────────────────

export async function getInvestmentTransactions(db: DB, limit = 100) {
  return db
    .select()
    .from(schema.investmentTransactions)
    .orderBy(desc(schema.investmentTransactions.date))
    .limit(limit)
    .all()
}


export async function getInvestmentSummary(db: DB) {
  const rows = await db
    .select()
    .from(schema.investmentTransactions)
    .all()

  let dividends = 0
  let contributions = 0
  let withdrawals = 0

  for (const r of rows) {
    const t = r.type.toLowerCase()
    const sub = (r.subtype ?? '').toLowerCase()
    if (t === 'dividend' || sub === 'dividend') dividends += r.amount
    else if (t === 'cash' && r.amount < 0) contributions += Math.abs(r.amount)
    else if (t === 'cash' && r.amount > 0) withdrawals += r.amount
  }

  return { dividends, contributions, withdrawals }
}
