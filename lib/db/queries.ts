import { desc, eq, and, gte, sql, asc, lt } from 'drizzle-orm'
import * as schema from './schema'
import type { DB } from './index'
import { applyCategoryRules, type CategoryRule } from '@/lib/categories'

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

export function getLatestSnapshot(db: DB) {
  return db
    .select()
    .from(schema.snapshots)
    .orderBy(desc(schema.snapshots.date))
    .limit(1)
    .get() ?? null
}

export function getSnapshotHistory(db: DB, days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  return db
    .select()
    .from(schema.snapshots)
    .where(gte(schema.snapshots.date, localDateString(since)))
    .orderBy(asc(schema.snapshots.date))
    .all()
}

export function getAllSnapshotHistory(db: DB) {
  return db
    .select()
    .from(schema.snapshots)
    .orderBy(asc(schema.snapshots.date))
    .all()
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function getAllAccounts(db: DB) {
  return db
    .select()
    .from(schema.accounts)
    .orderBy(asc(schema.accounts.type), asc(schema.accounts.name))
    .all()
}

export function getLastSyncedAt(db: DB): number | null {
  const result = db
    .select({ maxUpdated: sql<number>`MAX(${schema.accounts.updatedAt})` })
    .from(schema.accounts)
    .get()
  return result?.maxUpdated ?? null
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export function getMonthlySpend(db: DB, year?: number, month?: number): number {
  const { start, end } = monthBounds(year, month)
  const result = db
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

export function getCategoryBreakdown(db: DB, year?: number, month?: number) {
  const { start, end } = monthBounds(year, month)
  const rules = getMerchantRules(db)

  const rows = db
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

export function getRecentTransactions(db: DB, limit = 20) {
  const rules = getMerchantRules(db)
  const rows = db
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

export function getTransactionsForMonth(db: DB, year: number, month: number) {
  const { start, end } = monthBounds(year, month)
  const rules = getMerchantRules(db)

  const rows = db
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
        // Regular expenses + all TRANSFER_IN (so user can label/deduct them)
        sql`(${schema.transactions.amount} > 0 OR ${schema.transactions.category} = 'TRANSFER_IN')`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .orderBy(desc(schema.transactions.date), desc(schema.transactions.amount))
    .all()

  return applyCategoryRules(
    rows.map((r) => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )
}

export function getUnlabeledTransfers(db: DB, year?: number, month?: number) {
  const { start, end } = monthBounds(year, month)
  const rules = getMerchantRules(db)
  const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))

  const rows = db
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

export function setTransactionIgnored(db: DB, txId: string, ignored: boolean): void {
  db.update(schema.transactions)
    .set({ ignored: ignored ? 1 : 0 })
    .where(eq(schema.transactions.id, txId))
    .run()
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export function getAllHoldings(db: DB) {
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

export function getMerchantRules(db: DB): CategoryRule[] {
  return db
    .select()
    .from(schema.categoryRules)
    .all()
}

export function upsertCategoryRule(db: DB, merchantName: string, category: string): void {
  const id = `rule_${merchantName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`
  db
    .insert(schema.categoryRules)
    .values({ id, merchantName, category, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: schema.categoryRules.merchantName,
      set: { category },
    })
    .run()
  // Backfill: apply the rule to any transactions that don't have a manual override yet
  db
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

export function deleteCategoryRule(db: DB, id: string): void {
  db.delete(schema.categoryRules).where(eq(schema.categoryRules.id, id)).run()
}

export function updateTransactionCategory(db: DB, txId: string, category: string): void {
  db
    .update(schema.transactions)
    .set({ customCategory: category })
    .where(eq(schema.transactions.id, txId))
    .run()
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSetting(db: DB, key: string): string | null {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .get()
  return row?.value ?? null
}

export function upsertSetting(db: DB, key: string, value: string): void {
  db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run()
}

// ─── Category budgets (per-month planner) ────────────────────────────────────

export function getCategoryBudgets(db: DB, year: number, month: number) {
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

export function upsertCategoryBudget(db: DB, category: string, year: number, month: number, planned: number): void {
  db
    .insert(schema.categoryBudgets)
    .values({ id: `${category}_${year}_${month}`, category, year, month, planned })
    .onConflictDoUpdate({
      target: schema.categoryBudgets.id,
      set: { planned },
    })
    .run()
}

export function deleteCategoryBudget(db: DB, category: string, year: number, month: number): void {
  db
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

export function getMostRecentBudgets(db: DB, beforeYear: number, beforeMonth: number) {
  // Find all months with budgets prior to the given month, pick the most recent one
  const allPrior = db
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

export function seedBudgetFromPrevious(db: DB, year: number, month: number): void {
  const previous = getMostRecentBudgets(db, year, month)
  for (const b of previous) {
    upsertCategoryBudget(db, b.category, year, month, b.planned)
  }
}

// ─── Custom categories ────────────────────────────────────────────────────────

export function getCategoryTrendMonths(db: DB, count = 6) {
  const now = new Date()
  // First day of the earliest month we want
  const startDate = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1)
  const rangeStart = localDateString(startDate)

  const rules = getMerchantRules(db)

  const rows = db
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

export function getCustomCategories(db: DB) {
  return db
    .select()
    .from(schema.customCategories)
    .orderBy(asc(schema.customCategories.name))
    .all()
}

export function addCustomCategory(db: DB, name: string, color?: string): void {
  const id = `custom_${Date.now()}`
  db
    .insert(schema.customCategories)
    .values({ id, name, color: color ?? null, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoNothing()
    .run()
}

export function deleteCustomCategory(db: DB, id: string): void {
  db.delete(schema.customCategories).where(eq(schema.customCategories.id, id)).run()
}
