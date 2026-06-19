# Finance Dashboard Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unrealized investment gains, 6-month spending trend chart, recurring charges detector, transaction search, and a month-end spend predictor to the personal finance dashboard.

**Architecture:** All new queries land in `lib/db/queries.ts` following the existing Drizzle ORM pattern. New chart/display components are client components in `components/`. Server pages (`app/spending/page.tsx`, `app/investments/page.tsx`) call the queries and pass data down as props — no new API routes needed. Category-rule application always happens in JS after DB queries (same pattern as all existing queries).

**Tech Stack:** Next.js (App Router), Drizzle ORM + SQLite, Recharts, Tailwind CSS, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/db/queries.ts` | Modify | Add `getCategoryTrendMonths`, `getRecurringMerchants` |
| `components/HoldingRow.tsx` | Modify | Show cost basis, unrealized gain ($), unrealized gain (%) |
| `app/investments/page.tsx` | Modify | Add Gain/Loss column header and total row |
| `components/SpendingTrendChart.tsx` | Create | Stacked bar chart of category spend by month (recharts) |
| `components/RecurringCard.tsx` | Create | Card listing detected recurring/subscription charges |
| `components/TransactionList.tsx` | Create | Client component: search input + filtered transaction list |
| `app/spending/page.tsx` | Modify | Wire trend chart, recurring card, transaction list, predictor card |

---

## Task 1: Unrealized Gains on Holdings

**Files:**
- Modify: `components/HoldingRow.tsx`
- Modify: `app/investments/page.tsx`

No new query needed — `getAllHoldings` already returns `costBasis`.

- [ ] **Step 1: Update `HoldingRow.tsx` to show gain/loss**

Replace the file content:

```tsx
import { formatCAD } from '@/lib/format'

type Holding = {
  id: string
  securityName: string
  tickerSymbol: string | null
  institutionValue: number
  costBasis: number | null
}

type Props = {
  holding: Holding
  totalPortfolioValue: number
}

export function HoldingRow({ holding, totalPortfolioValue }: Props) {
  const weight = totalPortfolioValue > 0 ? (holding.institutionValue / totalPortfolioValue) * 100 : 0
  const gain = holding.costBasis != null && holding.costBasis > 0
    ? holding.institutionValue - holding.costBasis
    : null
  const gainPct = gain != null && holding.costBasis! > 0
    ? (gain / holding.costBasis!) * 100
    : null
  const gainPositive = gain !== null && gain >= 0

  return (
    <tr className="border-b border-[var(--hairline)] last:border-0">
      <td className="py-3 text-[14px]">
        <span className="font-bold text-[var(--ink)]">{holding.tickerSymbol ?? '—'}</span>
        {' '}
        <span className="text-[var(--muted-text)] text-[13px]">{holding.securityName}</span>
      </td>
      <td className="py-3 text-right tabular-nums text-[14px] font-medium text-[var(--ink)]">
        {formatCAD(holding.institutionValue)}
      </td>
      <td className="py-3 text-right tabular-nums text-[14px]">
        {gain !== null ? (
          <span className={gainPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
            {gain >= 0 ? '+' : ''}{formatCAD(gain)}
            {gainPct !== null && (
              <span className="ml-1 text-[12px] opacity-75">
                ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--faint)]">—</span>
        )}
      </td>
      <td className="py-3 text-right tabular-nums text-[14px] text-[var(--muted-text)]">
        {weight.toFixed(0)}%
      </td>
    </tr>
  )
}
```

- [ ] **Step 2: Add Gain/Loss column header in `app/investments/page.tsx`**

Find the `<thead>` block and add a Gain/Loss `<th>` between Value and Weight:

```tsx
<th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Value</th>
<th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Gain / Loss</th>
<th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Weight</th>
```

- [ ] **Step 3: Add total unrealized gain row to investments page**

After the holdings loop, compute and display total unrealized gain in the footer row. In `app/investments/page.tsx`, update the footer:

```tsx
const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0)
const totalGain = totalCostBasis > 0
  ? holdings.reduce((s, h) => s + (h.costBasis != null ? h.institutionValue - h.costBasis : 0), 0)
  : null
const totalGainPct = totalGain !== null && totalCostBasis > 0
  ? (totalGain / totalCostBasis) * 100
  : null
```

And update the footer `<div>` to span 4 columns and show the gain:

```tsx
<div className="flex justify-between pt-3 border-t border-[var(--hairline)] mt-1">
  <span className="text-[13px] font-semibold text-[var(--muted-text)]">Total</span>
  <div className="flex items-center gap-6">
    {totalGain !== null && (
      <span className={[
        'text-[13px] font-semibold tabular-nums',
        totalGain >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
      ].join(' ')}>
        {totalGain >= 0 ? '+' : ''}{formatCAD(totalGain)}
        {totalGainPct !== null && (
          <span className="ml-1 opacity-75 font-normal">
            ({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)
          </span>
        )}
      </span>
    )}
    <span className="text-[13px] font-bold tabular-nums text-[var(--ink)]">{formatCAD(totalPortfolioValue)}</span>
  </div>
</div>
```

- [ ] **Step 4: Verify visually**

Run `npm run dev`, open `/investments`. Holdings table should show a Gain/Loss column with green/red values. Rows without cost basis show `—`.

- [ ] **Step 5: Commit**

```bash
git add components/HoldingRow.tsx app/investments/page.tsx
git commit -m "feat: show unrealized gain/loss on holdings table"
```

---

## Task 2: 6-Month Category Trend Chart

**Files:**
- Modify: `lib/db/queries.ts`
- Create: `components/SpendingTrendChart.tsx`
- Modify: `app/spending/page.tsx`

- [ ] **Step 1: Add `getCategoryTrendMonths` to `lib/db/queries.ts`**

This function returns the last N months each with a full category breakdown. It batches the raw query for the full date range, then applies category rules and partitions the result by month.

Append to `lib/db/queries.ts`:

```ts
export function getCategoryTrendMonths(db: DB, count = 6) {
  // Build start date = first day of the earliest month we want
  const now = new Date()
  const startYear = now.getFullYear()
  const startMonth = now.getMonth() + 1 - (count - 1) // can be negative
  const absYear = startYear + Math.floor((startMonth - 1) / 12)
  const absMo = ((startMonth - 1 + 120) % 12) + 1 // keep positive
  const rangeStart = `${absYear}-${String(absMo).padStart(2, '0')}-01`

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

  // Apply category rules in JS (same pattern as getCategoryBreakdown)
  const applied = applyCategoryRules(
    rows.map(r => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )

  // Build the last `count` months as output slots
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
```

- [ ] **Step 2: Create `components/SpendingTrendChart.tsx`**

```tsx
'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'

type MonthData = {
  label: string
  breakdown: { category: string; total: number }[]
}

type Props = {
  months: MonthData[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <div className="bg-white border border-[var(--hairline)] rounded-[10px] px-3 py-2 text-[13px] shadow-md min-w-[160px]">
      <p className="font-semibold text-[var(--ink)] mb-1">{label} — {formatCAD(total)}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-[var(--muted-text)]">{getCategoryLabel(p.name)}</span>
          </div>
          <span className="tabular-nums text-[var(--ink)]">{formatCAD(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function SpendingTrendChart({ months }: Props) {
  if (months.length < 2) {
    return (
      <p className="text-[12px] text-[var(--faint)] text-center py-8">
        Not enough history yet — check back next month
      </p>
    )
  }

  // Collect all categories that appear, sort by total spend descending, cap at top 5 + Other
  const categoryTotals = new Map<string, number>()
  for (const m of months) {
    for (const b of m.breakdown) {
      categoryTotals.set(b.category, (categoryTotals.get(b.category) ?? 0) + b.total)
    }
  }
  const sorted = Array.from(categoryTotals.entries()).sort((a, b) => b[1] - a[1])
  const topCategories = sorted.slice(0, 5).map(([c]) => c)
  const hasOther = sorted.length > 5

  // Reshape into recharts format: [{ label, CAT1: 100, CAT2: 200, Other: 50 }, ...]
  const data = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label }
    let otherTotal = 0
    for (const b of m.breakdown) {
      if (topCategories.includes(b.category)) {
        row[b.category] = (row[b.category] as number ?? 0) + b.total
      } else {
        otherTotal += b.total
      }
    }
    if (hasOther && otherTotal > 0) row['Other'] = otherTotal
    return row
  })

  const allKeys = [...topCategories, ...(hasOther ? ['Other'] : [])]

  return (
    <div className="mt-4 -mx-1" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--faint)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg)', opacity: 0.5 }} />
          {allKeys.map((cat) => (
            <Bar
              key={cat}
              dataKey={cat}
              stackId="a"
              fill={getCategoryColor(cat)}
              radius={cat === allKeys[allKeys.length - 1] ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `app/spending/page.tsx`**

Add the import at the top:
```tsx
import { SpendingTrendChart } from '@/components/SpendingTrendChart'
```

Add the query call (server side, in the existing data-fetching block):
```tsx
const trendMonths = getCategoryTrendMonths(db, 6)
```

Add the `getCategoryTrendMonths` to the import from `@/lib/db/queries`.

Render the card after the category breakdown section (before the TransferAlert):
```tsx
{/* 6-month trend */}
<div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
  <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
    Spending trend
  </h3>
  <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Last 6 months by category</p>
  <SpendingTrendChart months={trendMonths} />
</div>
```

- [ ] **Step 4: Verify visually**

Open `/spending`. A stacked bar chart should appear below the category breakdown, showing the last 6 months. Hover for tooltip with per-category breakdown. No chart if fewer than 2 months of data.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts components/SpendingTrendChart.tsx app/spending/page.tsx
git commit -m "feat: add 6-month category trend chart to spending page"
```

---

## Task 3: Recurring Charges Detector

**Files:**
- Modify: `lib/db/queries.ts`
- Create: `components/RecurringCard.tsx`
- Modify: `app/spending/page.tsx`

- [ ] **Step 1: Add `getRecurringMerchants` to `lib/db/queries.ts`**

Find merchants that appear in at least 2 of the last 3 calendar months with a positive amount. Apply category rules so the displayed category is accurate.

Append to `lib/db/queries.ts`:

```ts
export function getRecurringMerchants(db: DB) {
  const now = new Date()
  // Start of 3 months ago
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const rangeStart = localDateString(start)

  const rules = getMerchantRules(db)

  const rows = db
    .select({
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
      monthKey: sql<string>`strftime('%Y-%m', ${schema.transactions.date})`,
      avgAmount: sql<number>`AVG(${schema.transactions.amount})`,
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
    .groupBy(schema.transactions.merchantName, sql`strftime('%Y-%m', ${schema.transactions.date})`, schema.transactions.category, schema.transactions.customCategory)
    .all()

  // Apply rules
  const applied = applyCategoryRules(
    rows.map(r => ({ ...r, merchantName: r.merchantName ?? null, customCategory: r.customCategory ?? null })),
    rules,
  )

  // Group by merchant: count distinct months, average the averages
  const merchantMap = new Map<string, { months: Set<string>; amounts: number[]; category: string }>()
  for (const row of applied) {
    if (!row.merchantName) continue
    if (!merchantMap.has(row.merchantName)) {
      merchantMap.set(row.merchantName, { months: new Set(), amounts: [], category: row.category })
    }
    const entry = merchantMap.get(row.merchantName)!
    entry.months.add(row.monthKey)
    entry.amounts.push(row.avgAmount)
  }

  return Array.from(merchantMap.entries())
    .filter(([, v]) => v.months.size >= 2)
    .map(([merchantName, v]) => ({
      merchantName,
      category: v.category,
      avgAmount: v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length,
      monthCount: v.months.size,
    }))
    .sort((a, b) => b.avgAmount - a.avgAmount)
}
```

- [ ] **Step 2: Create `components/RecurringCard.tsx`**

```tsx
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { Repeat2 } from 'lucide-react'

type RecurringMerchant = {
  merchantName: string
  category: string
  avgAmount: number
  monthCount: number
}

type Props = {
  merchants: RecurringMerchant[]
}

export function RecurringCard({ merchants }: Props) {
  if (merchants.length === 0) return null

  const monthlyTotal = merchants.reduce((s, m) => s + m.avgAmount, 0)

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Recurring charges
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            Detected in 2+ of the last 3 months
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Est. monthly</p>
          <p className="font-bold text-[20px] tabular-nums text-[var(--ink)] mt-0.5">{formatCAD(monthlyTotal)}</p>
        </div>
      </div>

      <div className="space-y-0 divide-y divide-[var(--hairline)]">
        {merchants.map((m) => (
          <div key={m.merchantName} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Repeat2 size={13} className="text-[var(--faint)] shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--ink)] truncate">{m.merchantName}</p>
                <p className="text-[12px] text-[var(--muted-text)]" style={{ color: getCategoryColor(m.category) }}>
                  {getCategoryLabel(m.category)}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">~{formatCAD(m.avgAmount)}</p>
              <p className="text-[11px] text-[var(--faint)]">{m.monthCount}× last 3 mo</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `app/spending/page.tsx`**

Add import:
```tsx
import { RecurringCard } from '@/components/RecurringCard'
```

Add query call (server-side data fetching block):
```tsx
const recurringMerchants = getRecurringMerchants(db)
```

Add `getRecurringMerchants` to the queries import.

Render the card after the trend chart (before TransferAlert):
```tsx
<RecurringCard merchants={recurringMerchants} />
```

- [ ] **Step 4: Verify visually**

Open `/spending`. If there are merchants repeating across months, a "Recurring charges" card appears with estimated monthly cost. Card is hidden if none detected.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts components/RecurringCard.tsx app/spending/page.tsx
git commit -m "feat: detect and display recurring charges on spending page"
```

---

## Task 4: Transaction Search

**Files:**
- Create: `components/TransactionList.tsx`
- Modify: `app/spending/page.tsx`

The spending page is a server component. The transaction list needs to be client-interactive (filter on type). Solution: extract the list into a `'use client'` component that accepts all transactions as a prop and filters them locally.

- [ ] **Step 1: Create `components/TransactionList.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { TransactionRow } from '@/components/TransactionRow'
import { Search } from 'lucide-react'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory: string | null
  pending: number
  ignored: number
}

type Props = {
  transactions: Transaction[]
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

export function TransactionList({ transactions, rules, knownCustomCategories }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter(
      (tx) => tx.merchantName?.toLowerCase().includes(q)
    )
  }, [transactions, query])

  return (
    <div>
      {/* Search input */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants…"
          className="w-full pl-8 pr-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--faint)] text-center py-6">No transactions match "{query}"</p>
      ) : (
        <div>
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              rules={rules}
              knownCustomCategories={knownCustomCategories}
            />
          ))}
          {query && filtered.length < transactions.length && (
            <p className="text-[12px] text-[var(--faint)] text-center pt-3">
              Showing {filtered.length} of {transactions.length} transactions
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace transaction rendering in `app/spending/page.tsx`**

Add import:
```tsx
import { TransactionList } from '@/components/TransactionList'
```

Find the transactions card block (currently uses `transactions.map((tx) => <TransactionRow ...>)`) and replace the inner `<div>` with:

```tsx
<TransactionList
  transactions={transactions}
  rules={rules}
  knownCustomCategories={knownCustomCategories}
/>
```

Remove the now-unused `TransactionRow` import from `app/spending/page.tsx` if it's no longer used directly on that page.

- [ ] **Step 3: Verify visually**

Open `/spending`. Transactions card should have a search bar. Typing "Tim" should filter to Tim Hortons etc. Clearing the input restores all transactions.

- [ ] **Step 4: Commit**

```bash
git add components/TransactionList.tsx app/spending/page.tsx
git commit -m "feat: add transaction search to spending page"
```

---

## Task 5: Month-End Spend Predictor

**Files:**
- Modify: `app/spending/page.tsx`

Pure math — no new query or component needed. Only show predictor for the current calendar month. The prediction is a linear extrapolation: `projected = (spentSoFar / dayOfMonth) * daysInMonth`.

- [ ] **Step 1: Add predictor math to `app/spending/page.tsx`**

In the server component's data-fetching section, after the existing variable declarations, add:

```tsx
// Predictor: only meaningful for current month
const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
const dayOfMonth = now.getDate()
const daysInMonth = new Date(year, month, 0).getDate()
const projectedSpend = isCurrentMonth && dayOfMonth > 0
  ? (spend / dayOfMonth) * daysInMonth
  : null
const projectedRemaining = projectedSpend !== null ? allowance - projectedSpend : null
const projectedSavings = projectedSpend !== null && income > 0 ? income - projectedSpend : null
const projectedSavingsRate = projectedSavings !== null && income > 0
  ? (projectedSavings / income) * 100
  : null
```

- [ ] **Step 2: Render predictor card in `app/spending/page.tsx`**

Add a new card after the budget progress bar (`ProgressBar` card) and before the category breakdown section:

```tsx
{/* Predictor */}
{projectedSpend !== null && (
  <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Month-end forecast</p>
        <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
          {formatCAD(projectedSpend)}
        </p>
        <p className="text-[13px] text-[var(--muted-text)] mt-1">
          projected by end of month · day {dayOfMonth}/{daysInMonth}
        </p>
      </div>
      <div className="text-right">
        {projectedRemaining !== null && (
          <div className={[
            'inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full',
            projectedRemaining >= 0 ? 'bg-[#e6f1ea] text-[var(--positive)]' : 'bg-[#f6e8e4] text-[var(--negative)]',
          ].join(' ')}>
            {projectedRemaining >= 0 ? '▲' : '▼'}{' '}
            {projectedRemaining >= 0
              ? `${formatCAD(projectedRemaining)} under`
              : `${formatCAD(Math.abs(projectedRemaining))} over`}
          </div>
        )}
        {projectedSavingsRate !== null && (
          <p className="text-[12px] text-[var(--muted-text)] mt-1.5">
            {projectedSavingsRate >= 0 ? '+' : ''}{projectedSavingsRate.toFixed(1)}% projected savings rate
          </p>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify visually**

Open `/spending` on the current month. A "Month-end forecast" card should appear showing projected spend with an over/under badge. Navigating to a past month hides the card.

- [ ] **Step 4: Commit**

```bash
git add app/spending/page.tsx
git commit -m "feat: add month-end spend predictor to spending page"
```

---

## Final Verification

- [ ] Run `npm run build` — confirm no TypeScript errors.
- [ ] Navigate through all pages: `/investments`, `/spending`, `/spending?year=2025&month=12` (past month hides predictor).
- [ ] Confirm chart tooltips render correctly on hover.
- [ ] Confirm recurring card is hidden when no recurring merchants detected.
