import { desc, eq, and, gte, sql, asc, lt } from 'drizzle-orm'
import * as schema from './schema'
import type { DB } from './index'
import { applyCategoryRules, type CategoryRule } from '@/lib/categories'

function shortAccountLabel(accountName: string, institutionName: string): string {
  const inst = institutionName.toLowerCase()
  const acc = accountName.toLowerCase()
  if (inst.includes('american express') || acc.includes('boustany')) return 'Amex'
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

export function applyAllCategoryRules(db: DB): void {
  const rules = getMerchantRules(db)
  for (const rule of rules) {
    db
      .update(schema.transactions)
      .set({ customCategory: rule.category })
      .where(
        and(
          eq(schema.transactions.merchantName, rule.merchantName),
          sql`${schema.transactions.customCategory} IS NULL`,
        )
      )
      .run()
  }
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

export function getRecurringMerchants(db: DB) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const rangeStart = localDateString(start)

  const rules = getMerchantRules(db)

  const dismissed = new Set(
    db.select().from(schema.dismissedRecurring).all().map(r => r.merchantName)
  )
  const manual = db.select().from(schema.manualRecurring).all()

  const rows = db
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
    const avgAmount = matchingAmounts.reduce((s, a) => s + a, 0) / matchingAmounts.length

    result.push({ merchantName, category: data.category, avgAmount, monthCount: bestCount, dayOfMonth: bestDay, isManual: false })
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
    })
  }

  return result.sort((a, b) => b.avgAmount - a.avgAmount)
}

export function dismissRecurringMerchant(db: DB, merchantName: string): void {
  db.insert(schema.dismissedRecurring).values({ merchantName }).onConflictDoNothing().run()
}

export function addManualRecurring(db: DB, merchantName: string, dayOfMonth: number, avgAmount: number, category: string): void {
  const id = `manual_rec_${Date.now()}`
  db
    .insert(schema.manualRecurring)
    .values({ id, merchantName, dayOfMonth, avgAmount, category, createdAt: Math.floor(Date.now() / 1000) })
    .onConflictDoUpdate({
      target: schema.manualRecurring.merchantName,
      set: { dayOfMonth, avgAmount, category },
    })
    .run()
}

export function deleteManualRecurring(db: DB, merchantName: string): void {
  db.delete(schema.manualRecurring).where(eq(schema.manualRecurring.merchantName, merchantName)).run()
}

export function updateManualRecurringCategory(db: DB, merchantName: string, category: string): void {
  db.update(schema.manualRecurring).set({ category }).where(eq(schema.manualRecurring.merchantName, merchantName)).run()
}

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

// ─── Committed Items ──────────────────────────────────────────────────────────

export function getCommittedItems(db: DB) {
  return db
    .select()
    .from(schema.committedItems)
    .orderBy(asc(schema.committedItems.createdAt))
    .all()
}

export function addCommittedItem(
  db: DB,
  name: string,
  type: 'income' | 'expense',
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
): void {
  db.insert(schema.committedItems)
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

export function deleteCommittedItem(db: DB, id: string): void {
  db.delete(schema.committedItems)
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
  confirmedAmount: number | null
}

export function getCommittedItemsWithStatus(db: DB, year: number, month: number): CommittedItemWithStatus[] {
  const { start, end } = monthBounds(year, month)
  const items = getCommittedItems(db)

  const txs = db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      merchantName: schema.transactions.merchantName,
    })
    .from(schema.transactions)
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
    const candidates = txs.filter((tx) => {
      const rightDirection = isIncome ? tx.amount < 0 : tx.amount > 0
      if (!rightDirection) return false
      const absAmount = Math.abs(tx.amount)
      // Income: ±30%. Expenses: +35%/-30% (bills can overshoot slightly).
      const withinRange = isIncome
        ? absAmount >= item.expectedAmount * 0.7 && absAmount <= item.expectedAmount * 1.3
        : absAmount >= item.expectedAmount * 0.7 && absAmount <= item.expectedAmount * 1.35
      if (!withinRange) return false
      if (item.merchantName) {
        return tx.merchantName?.toLowerCase().includes(item.merchantName.toLowerCase()) ?? false
      }
      return true
    })

    const best = candidates.sort((a, b) =>
      Math.abs(Math.abs(a.amount) - item.expectedAmount) - Math.abs(Math.abs(b.amount) - item.expectedAmount)
    )[0] ?? null

    return {
      id: item.id,
      name: item.name,
      type: item.type as 'income' | 'expense',
      expectedAmount: item.expectedAmount,
      expectedDay: item.expectedDay,
      merchantName: item.merchantName,
      category: item.category,
      confirmedAmount: best ? Math.abs(best.amount) : null,
    }
  })
}
