import { desc, eq, and, gte, sql, asc } from 'drizzle-orm'
import * as schema from './schema'
import type { DB } from './index'

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
  const sinceStr = since.toISOString().slice(0, 10)
  return db
    .select()
    .from(schema.snapshots)
    .where(gte(schema.snapshots.date, sinceStr))
    .orderBy(asc(schema.snapshots.date))
    .all()
}

export function getMonthlySpend(db: DB): number {
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  const since = firstOfMonth.toISOString().slice(0, 10)
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, since),
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .get()
  return result?.total ?? 0
}

export function getCategoryBreakdown(db: DB) {
  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  const since = firstOfMonth.toISOString().slice(0, 10)
  return db
    .select({
      category: schema.transactions.category,
      total: sql<number>`SUM(${schema.transactions.amount})`,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, since),
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
      ),
    )
    .groupBy(schema.transactions.category)
    .orderBy(desc(sql`SUM(${schema.transactions.amount})`))
    .all()
}

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
