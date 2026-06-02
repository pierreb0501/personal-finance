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
        lt(schema.transactions.date, end + 'Z'), // include end date
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
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
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .groupBy(schema.transactions.category, schema.transactions.merchantName, schema.transactions.customCategory)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .all()

  // Apply rules and re-aggregate by resolved category
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
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.amount} > 0`,
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
