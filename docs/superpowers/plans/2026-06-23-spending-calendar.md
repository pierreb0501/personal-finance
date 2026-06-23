# Spending Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/calendar` page showing a trading-journal-style month grid where each day is colored by net cash flow, with a click-through panel for that day's transactions and forecasted recurring/committed items.

**Architecture:** One new pure-logic module (`lib/calendar.ts`) for grid layout and heatmap color math, one new query (`getCalendarMonth` in `lib/db/queries.ts`) that composes three existing queries without any schema change, and three new presentational components (`CalendarDayCell`, `CalendarGrid`, `CalendarDayPanel`) wired together in a new server-rendered page. `MonthSelector` gets a small additive prop so the calendar (unlike `/spending` and `/recurring`) can navigate into future months.

**Tech Stack:** Next.js (App Router, server components), Drizzle ORM / SQLite (libsql), Jest + ts-jest (node env, no DOM — this repo has no React component testing setup, so only `lib/calendar.ts` and `getCalendarMonth` get unit tests; components are verified manually in-browser), Tailwind CSS, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-06-23-spending-calendar-design.md`

---

## Pre-existing gap found during planning

The spec says the calendar reuses the existing `MonthSelector` pattern to navigate into future months for forecasting. But `components/MonthSelector.tsx:43` currently has `disabled={isCurrentMonth}` — it **blocks all forward navigation past the current month**, everywhere it's used (`/spending`, `/recurring`). Task 1 below adds an opt-in `allowFuture` prop, defaulting to `false`, so `/spending` and `/recurring` keep their current behavior and only `/calendar` can page forward.

---

### Task 1: Let `MonthSelector` navigate into future months (opt-in)

**Files:**
- Modify: `components/MonthSelector.tsx`

- [ ] **Step 1: Add the `allowFuture` prop**

Edit `components/MonthSelector.tsx`:

```tsx
type Props = {
  year: number
  month: number
  basePath?: string
  allowFuture?: boolean
}
```

```tsx
export function MonthSelector({ year, month, basePath = '/spending', allowFuture = false }: Props) {
  const router = useRouter()
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
```

```tsx
      <button
        onClick={() => navigate(1)}
        disabled={!allowFuture && isCurrentMonth}
        className="p-[5px] rounded-[7px] hover:bg-white transition-colors text-[var(--muted-text)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. `/spending` and `/recurring` don't pass `allowFuture`, so they default to `false` and keep today's behavior exactly.

- [ ] **Step 3: Commit**

```bash
git add components/MonthSelector.tsx
git commit -m "feat: let MonthSelector opt into future-month navigation"
```

---

### Task 2: Pure calendar-grid and heatmap-color helpers

**Files:**
- Create: `lib/calendar.ts`
- Test: `__tests__/calendar.test.ts`

These are framework-free pure functions (grid layout math, color math) — straightforward to unit test under this repo's existing Jest config (`testEnvironment: 'node'`, no DOM needed).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/calendar.test.ts`:

```ts
import { getCalendarGridCells, getHeatmapStyle } from '@/lib/calendar'

describe('getCalendarGridCells', () => {
  it('returns a length that is a multiple of 7', () => {
    const cells = getCalendarGridCells(2026, 6)
    expect(cells.length % 7).toBe(0)
  })

  it('pads leading cells to align the 1st with its real weekday', () => {
    const year = 2026
    const month = 6
    const expectedLeadingBlanks = new Date(year, month - 1, 1).getDay()
    const cells = getCalendarGridCells(year, month)
    const firstNonNullIndex = cells.findIndex((c) => c !== null)
    expect(firstNonNullIndex).toBe(expectedLeadingBlanks)
  })

  it('includes every day of the month exactly once, in order', () => {
    const year = 2026
    const month = 6
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells = getCalendarGridCells(year, month)
    const dates = cells.filter((c): c is string => c !== null)
    expect(dates).toHaveLength(daysInMonth)
    expect(dates[0]).toBe(`${year}-06-01`)
    expect(dates[dates.length - 1]).toBe(`${year}-06-${String(daysInMonth).padStart(2, '0')}`)
  })

  it('handles February in a leap year', () => {
    const cells = getCalendarGridCells(2028, 2)
    const dates = cells.filter((c): c is string => c !== null)
    expect(dates).toHaveLength(29)
  })
})

describe('getHeatmapStyle', () => {
  it('returns a neutral, transparent style for a $0 net day', () => {
    const style = getHeatmapStyle(0, 500)
    expect(style.background).toBe('transparent')
  })

  it('returns full-intensity green for the month\'s biggest gain day', () => {
    const style = getHeatmapStyle(100, 100)
    expect(style.background).toBe('rgba(46, 125, 91, 0.90)')
    expect(style.textColor).toBe('#FFFFFF')
  })

  it('returns a lighter, non-white-text red for a small loss relative to the month', () => {
    const style = getHeatmapStyle(-50, 200)
    expect(style.background).toBe('rgba(181, 80, 60, 0.36)')
    expect(style.textColor).toBe('#B5503C')
  })

  it('treats a lone active day in the month as full intensity', () => {
    const style = getHeatmapStyle(-75, 75)
    expect(style.background).toBe('rgba(181, 80, 60, 0.90)')
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest __tests__/calendar.test.ts`
Expected: FAIL — `Cannot find module '@/lib/calendar'`

- [ ] **Step 3: Implement `lib/calendar.ts`**

```ts
// Pure layout/color helpers for the /calendar page — no DB access, no React.
// Kept framework-free so they're cheap to unit test.

const POSITIVE_RGB: [number, number, number] = [46, 125, 91]  // --positive, #2E7D5B
const NEGATIVE_RGB: [number, number, number] = [181, 80, 60]  // --negative, #B5503C

const MIN_ALPHA = 0.18
const MAX_ALPHA = 0.9
const WHITE_TEXT_THRESHOLD = 0.45

export type HeatmapStyle = {
  background: string
  textColor: string
}

/**
 * Maps a day's net cash flow to a trading-journal-style fill: deeper color
 * for bigger swings relative to the month, scaled between MIN_ALPHA (barely
 * tinted) and MAX_ALPHA (fully saturated). $0 days are left transparent so
 * they read as "no activity" rather than "tiny loss".
 */
export function getHeatmapStyle(netTotal: number, maxAbsNetTotal: number): HeatmapStyle {
  if (netTotal === 0) {
    return { background: 'transparent', textColor: 'var(--faint)' }
  }

  const ratio = maxAbsNetTotal > 0 ? Math.min(Math.abs(netTotal) / maxAbsNetTotal, 1) : 0
  const alpha = MIN_ALPHA + ratio * (MAX_ALPHA - MIN_ALPHA)
  const [r, g, b] = netTotal > 0 ? POSITIVE_RGB : NEGATIVE_RGB

  return {
    background: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    textColor: alpha > WHITE_TEXT_THRESHOLD ? '#FFFFFF' : (netTotal > 0 ? '#2E7D5B' : '#B5503C'),
  }
}

/**
 * Builds a Sun-Sat month grid as a flat array (length always a multiple of
 * 7): null for leading/trailing blanks, 'YYYY-MM-DD' for each real day.
 */
export function getCalendarGridCells(year: number, month: number): (string | null)[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0 = Sun .. 6 = Sat

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest __tests__/calendar.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/calendar.ts __tests__/calendar.test.ts
git commit -m "feat: add pure calendar grid and heatmap color helpers"
```

---

### Task 3: `getCalendarMonth` query

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `__tests__/calendar.test.ts` (same file as Task 2 — same feature, same conventions as `db.test.ts`)

This composes three existing functions already in `lib/db/queries.ts`: `getTransactionsForMonth`, `getCommittedItemsWithStatus`, `getRecurringMerchantsWithStatus`. No migration.

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/calendar.test.ts` (new imports at the top, new `describe` block at the bottom):

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getCalendarMonth, addCommittedItem, addManualRecurring } from '@/lib/db/queries'
```

```ts
function createTestDb(): DB {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db as unknown as DB
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function seedAccount(db: DB) {
  const itemId = 'item-1'
  const accountId = 'acc-1'
  db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
  db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
  return accountId
}

describe('getCalendarMonth', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('builds one entry per day of the month with zeroed totals when there is no data', async () => {
    const result = await getCalendarMonth(db, 2026, 4) // April = 30 days
    expect(result.days).toHaveLength(30)
    expect(result.days.every((d) => d.netTotal === 0 && d.actual.length === 0)).toBe(true)
    expect(result.maxAbsNetTotal).toBe(0)
  })

  it('computes net total as income minus spend and buckets transactions by date', async () => {
    const accountId = seedAccount(db)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: '2026-04-05', merchantName: 'Metro', category: 'GROCERIES', categoryDetailed: 'GROCERIES_SUPERMARKETS', pending: 0 },
      { id: 't2', accountId, amount: -1000, date: '2026-04-05', merchantName: 'Employer', category: 'INCOME', categoryDetailed: 'INCOME_WAGES', pending: 0 },
    ]).run()

    const result = await getCalendarMonth(db, 2026, 4)
    const day5 = result.days.find((d) => d.date === '2026-04-05')!
    expect(day5.netTotal).toBe(950) // 1000 income - 50 spend
    expect(day5.actual).toHaveLength(2)
    expect(result.maxAbsNetTotal).toBe(950)
  })

  it('excludes ignored transactions from totals and actual entries', async () => {
    const accountId = seedAccount(db)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: '2026-04-05', merchantName: 'Metro', category: 'GROCERIES', categoryDetailed: 'GROCERIES_SUPERMARKETS', pending: 0, ignored: 1 },
    ]).run()

    const result = await getCalendarMonth(db, 2026, 4)
    const day5 = result.days.find((d) => d.date === '2026-04-05')!
    expect(day5.netTotal).toBe(0)
    expect(day5.actual).toHaveLength(0)
  })

  it('projects an unconfirmed committed item onto its expected day, clamped to the last day of a short month', async () => {
    const year = futureYear()
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 31)

    const result = await getCalendarMonth(db, year, 4) // April has 30 days
    const lastDay = result.days.find((d) => d.date === `${year}-04-30`)!
    expect(lastDay.expected).toHaveLength(1)
    expect(lastDay.expected[0]).toMatchObject({ name: 'Rent', amount: 1500, type: 'expense', source: 'committed' })
  })

  it('drops an expected entry once it has a confirmed match, since it already shows up as an actual transaction', async () => {
    const accountId = seedAccount(db)
    const year = futureYear()
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 1)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 1500, date: `${year}-04-01`, merchantName: 'Landlord', category: 'RENT_AND_UTILITIES', categoryDetailed: 'RENT_AND_UTILITIES_RENT', pending: 0 },
    ]).run()

    const result = await getCalendarMonth(db, year, 4)
    const day1 = result.days.find((d) => d.date === `${year}-04-01`)!
    expect(day1.expected).toHaveLength(0)
    expect(day1.actual).toHaveLength(1)
  })

  it('projects an unconfirmed manual recurring merchant onto its day-of-month', async () => {
    const year = futureYear()
    await addManualRecurring(db, 'Netflix', 15, 16.99, 'ENTERTAINMENT')

    const result = await getCalendarMonth(db, year, 4)
    const day15 = result.days.find((d) => d.date === `${year}-04-15`)!
    expect(day15.expected).toHaveLength(1)
    expect(day15.expected[0]).toMatchObject({ name: 'Netflix', amount: 16.99, type: 'expense', source: 'recurring' })
  })

  it('never shows expected entries for days already in the past', async () => {
    // A committed item expected on day 1 of the *current* month, viewed
    // partway through the month, should not be forecast for day 1 if today
    // has already passed it — exercised by pointing the expected day at
    // yesterday relative to "now" inside a month that started in the past.
    const now = new Date()
    if (now.getDate() === 1) return // can't simulate "yesterday" on the 1st; skip this edge day
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 1)

    const result = await getCalendarMonth(db, now.getFullYear(), now.getMonth() + 1)
    const day1 = result.days.find((d) => d.date.endsWith('-01'))!
    expect(day1.expected).toHaveLength(0)
  })
})

function futureYear(): number {
  return new Date().getFullYear() + 1
}
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx jest __tests__/calendar.test.ts`
Expected: FAIL — `getCalendarMonth is not a function` (or similar — `addCommittedItem`/`addManualRecurring` already exist, only `getCalendarMonth` is missing)

- [ ] **Step 3: Implement `getCalendarMonth` in `lib/db/queries.ts`**

Add near the bottom of the file (after `getRecurringMerchantsWithStatus`, since it depends on it):

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx jest __tests__/calendar.test.ts`
Expected: PASS (all tests from Task 2 and Task 3)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npx jest`
Expected: PASS, no regressions in `db.test.ts`, `sync.test.ts`, `amex.test.ts`, `session.test.ts`

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts __tests__/calendar.test.ts
git commit -m "feat: add getCalendarMonth query combining actual and forecasted transactions"
```

---

### Task 4: `CalendarDayCell` component

**Files:**
- Create: `components/CalendarDayCell.tsx`

Presentational square: full-fill heatmap color when there's actual net activity, neutral when there isn't, small corner dot when there are expected-only entries.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { getHeatmapStyle } from '@/lib/calendar'
import { formatCAD } from '@/lib/format'
import type { CalendarDay } from '@/lib/db/queries'

type Props = {
  date: string
  day: CalendarDay | undefined
  maxAbsNetTotal: number
  isToday: boolean
  isSelected: boolean
  onSelect: (date: string) => void
}

export function CalendarDayCell({ date, day, maxAbsNetTotal, isToday, isSelected, onSelect }: Props) {
  const dayNumber = Number(date.slice(-2))
  const hasActual = (day?.actual.length ?? 0) > 0
  const hasExpectedOnly = !hasActual && (day?.expected.length ?? 0) > 0
  const netTotal = day?.netTotal ?? 0

  const style = hasActual ? getHeatmapStyle(netTotal, maxAbsNetTotal) : getHeatmapStyle(0, maxAbsNetTotal)

  return (
    <button
      onClick={() => onSelect(date)}
      className={[
        'relative aspect-square rounded-[10px] border p-1.5 flex flex-col items-start justify-between text-left transition-shadow cursor-pointer',
        isSelected ? 'border-[var(--ink)] ring-2 ring-[var(--ink)] ring-opacity-20' : 'border-[var(--hairline)]',
        isToday ? 'border-dashed' : '',
      ].join(' ')}
      style={{ background: style.background }}
    >
      <span
        className="text-[11px] font-semibold"
        style={{ color: hasActual ? style.textColor : 'var(--faint)' }}
      >
        {dayNumber}
      </span>

      {hasActual && (
        <span
          className="text-[12px] sm:text-[13px] font-bold tabular-nums self-center"
          style={{ color: style.textColor }}
        >
          {netTotal >= 0 ? '+' : '-'}{formatCAD(Math.abs(netTotal))}
        </span>
      )}

      {hasExpectedOnly && (
        <span className="absolute top-1.5 right-1.5 w-[7px] h-[7px] rounded-full bg-[#E8A23D]" />
      )}
    </button>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (Task 5 will create the `CalendarDay`/`CalendarMonth` consumer, but the types already exist from Task 3)

- [ ] **Step 3: Commit**

```bash
git add components/CalendarDayCell.tsx
git commit -m "feat: add CalendarDayCell presentational component"
```

---

### Task 5: `CalendarGrid` component

**Files:**
- Create: `components/CalendarGrid.tsx`

Client component owning `selectedDate` state, laying out `CalendarDayCell`s via `getCalendarGridCells`, and rendering `CalendarDayPanel` (built in Task 6) for the selected day.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { getCalendarGridCells } from '@/lib/calendar'
import { CalendarDayCell } from '@/components/CalendarDayCell'
import { CalendarDayPanel } from '@/components/CalendarDayPanel'
import type { CalendarMonth } from '@/lib/db/queries'
import type { CategoryRule } from '@/lib/categories'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  year: number
  month: number
  calendar: CalendarMonth
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

export function CalendarGrid({ year, month, calendar, rules, knownCustomCategories }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const cells = getCalendarGridCells(year, month)
  const dayMap = new Map(calendar.days.map((d) => [d.date, d]))
  const todayStr = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })()

  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)] py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date, i) =>
          date ? (
            <CalendarDayCell
              key={date}
              date={date}
              day={dayMap.get(date)}
              maxAbsNetTotal={calendar.maxAbsNetTotal}
              isToday={date === todayStr}
              isSelected={date === selectedDate}
              onSelect={setSelectedDate}
            />
          ) : (
            <div key={`blank-${i}`} />
          )
        )}
      </div>

      {selectedDate && (
        <CalendarDayPanel
          date={selectedDate}
          day={selectedDay}
          rules={rules}
          knownCustomCategories={knownCustomCategories}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: will still error until `CalendarDayPanel` exists (Task 6) — that's expected at this point, not a regression to fix yet.

- [ ] **Step 3: Commit**

```bash
git add components/CalendarGrid.tsx
git commit -m "feat: add CalendarGrid component with day selection state"
```

---

### Task 6: `CalendarDayPanel` component

**Files:**
- Create: `components/CalendarDayPanel.tsx`

Side panel on desktop, bottom sheet on mobile (same `md:` breakpoint convention as `Sidebar.tsx`). Lists actual transactions via `TransactionRow`, then expected/forecast entries in a visually distinct style, with an empty state when there's nothing to show.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { X, CalendarClock } from 'lucide-react'
import { TransactionRow } from '@/components/TransactionRow'
import { EmptyState } from '@/components/EmptyState'
import { formatCAD } from '@/lib/format'
import { getCategoryLabel } from '@/lib/categories'
import type { CalendarDay } from '@/lib/db/queries'
import type { CategoryRule } from '@/lib/categories'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

type Props = {
  date: string
  day: CalendarDay | undefined
  rules: CategoryRule[]
  knownCustomCategories: string[]
  onClose: () => void
}

export function CalendarDayPanel({ date, day, rules, knownCustomCategories, onClose }: Props) {
  const actual = day?.actual ?? []
  const expected = day?.expected ?? []
  const netTotal = day?.netTotal ?? 0
  const hasContent = actual.length > 0 || expected.length > 0

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-white border-[var(--hairline)] shadow-xl flex flex-col
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-[20px] border-t
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:top-0 md:h-full md:w-[420px] md:max-h-none md:rounded-t-none md:rounded-l-[20px] md:border-t-0 md:border-l"
      >
        <div className="flex items-start justify-between p-5 border-b border-[var(--hairline)]">
          <div>
            <p className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              {formatLongDate(date)}
            </p>
            {actual.length > 0 && (
              <p className={[
                'text-[14px] font-semibold tabular-nums mt-0.5',
                netTotal >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
              ].join(' ')}>
                {netTotal >= 0 ? '+' : '-'}{formatCAD(Math.abs(netTotal))} net
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex-1">
          {!hasContent && (
            <EmptyState
              icon={CalendarClock}
              message="No transactions or upcoming items"
              subMessage="This day is quiet"
            />
          )}

          {actual.length > 0 && (
            <div className="mb-5">
              {actual.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  rules={rules}
                  knownCustomCategories={knownCustomCategories}
                />
              ))}
            </div>
          )}

          {expected.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2.5">
                Expected
              </p>
              <div className="space-y-2">
                {expected.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] border border-dashed border-[#E8A23D] bg-[#FDF6E9]"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[var(--ink)] truncate">{item.name}</p>
                      <p className="text-[11px] text-[var(--muted-text)]">{getCategoryLabel(item.category)}</p>
                    </div>
                    <span className="text-[13.5px] font-semibold tabular-nums text-[#B8761F] shrink-0">
                      {item.type === 'income' ? '+' : '-'}{formatCAD(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors now that `CalendarGrid` and `CalendarDayPanel` both exist and match each other's prop types.

- [ ] **Step 3: Commit**

```bash
git add components/CalendarDayPanel.tsx
git commit -m "feat: add CalendarDayPanel side panel / bottom sheet component"
```

---

### Task 7: `/calendar` page

**Files:**
- Create: `app/calendar/page.tsx`

Server component following the same `searchParams` + data-fetch pattern as `app/spending/page.tsx`.

- [ ] **Step 1: Write the page**

```tsx
import { db } from '@/lib/db'
import { getCalendarMonth, getMerchantRules, getCustomCategories } from '@/lib/db/queries'
import { MonthSelector } from '@/components/MonthSelector'
import { CalendarGrid } from '@/components/CalendarGrid'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const now = new Date()
  const year = yearStr ? Number(yearStr) : now.getFullYear()
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1

  const calendar = await getCalendarMonth(db, year, month)
  const rules = await getMerchantRules(db)
  const customCats = await getCustomCategories(db)
  const knownCustomCategories = [...new Set([
    ...rules.map((r) => r.category),
    ...customCats.map((c) => c.name),
  ])]

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Calendar
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} basePath="/calendar" allowFuture />
      </div>

      <div className="flex items-center gap-4 mb-5 text-[12px] text-[var(--muted-text)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--positive)]" /> Net gain day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--negative)]" /> Net loss day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#E8A23D]" /> Upcoming expected item
        </span>
      </div>

      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
        <CalendarGrid
          year={year}
          month={month}
          calendar={calendar}
          rules={rules}
          knownCustomCategories={knownCustomCategories}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add /calendar page"
```

---

### Task 8: Wire up navigation

**Files:**
- Modify: `components/NavLinks.tsx`
- Modify: `components/ClientMobileTabBar.tsx`

- [ ] **Step 1: Add the desktop nav link**

Edit `components/NavLinks.tsx` — add `Calendar` to the lucide-react import, and insert the new entry between `Spending` and `Recurring`:

```tsx
import {
  LayoutGrid,
  TrendingUp,
  CreditCard,
  Calendar,
  BarChart2,
  Target,
  Tag,
  Repeat2,
  Landmark,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview',    href: '/',            icon: LayoutGrid },
  { label: 'Net Worth',   href: '/net-worth',   icon: TrendingUp },
  { label: 'Spending',    href: '/spending',    icon: CreditCard },
  { label: 'Calendar',    href: '/calendar',    icon: Calendar },
  { label: 'Recurring',   href: '/recurring',   icon: Repeat2 },
  { label: 'Budget',      href: '/budget',      icon: Target },
  { label: 'Investments', href: '/investments', icon: BarChart2 },
  { label: 'Categories',  href: '/categories',  icon: Tag },
  { label: 'Accounts',    href: '/accounts',    icon: Landmark },
]
```

- [ ] **Step 2: Add the mobile tab**

Edit `components/ClientMobileTabBar.tsx` — add `Calendar` as a 5th tab, after `Spending`:

```tsx
import { LayoutGrid, TrendingUp, CreditCard, Calendar, BarChart2, Target } from 'lucide-react'

const TABS = [
  { label: 'Overview',    href: '/',            icon: LayoutGrid },
  { label: 'Spending',    href: '/spending',    icon: CreditCard },
  { label: 'Calendar',    href: '/calendar',    icon: Calendar },
  { label: 'Budget',      href: '/budget',      icon: Target },
  { label: 'Invest',      href: '/investments', icon: BarChart2 },
]
```

(`TrendingUp` import in `ClientMobileTabBar.tsx` is already unused before this change — leave it as-is unless your linter flags it; don't fix unrelated lint debt as part of this task.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (this repo has no ESLint config/script — `tsc` is the only static check available)

- [ ] **Step 4: Commit**

```bash
git add components/NavLinks.tsx components/ClientMobileTabBar.tsx
git commit -m "feat: add Calendar to desktop and mobile navigation"
```

---

### Task 9: Manual verification in-browser

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Walk through the golden path**

In a browser:
1. Open `/calendar` — confirm the grid renders, weekday headers align, and the current month is shown.
2. Confirm days with real spend show a red-filled square with a centered negative amount; days with net income show green; days with no activity are neutral.
3. Click a colored day — confirm the side panel (desktop) opens on the right with that day's transactions matching `TransactionRow` styling used on `/spending`.
4. On a narrow viewport (or browser dev tools mobile emulation), click a day and confirm the panel renders as a bottom sheet instead.
5. Navigate to next month via `MonthSelector` (now enabled going forward only on `/calendar`) and confirm future days with recurring/committed forecasts show the small orange dot, and clicking them shows the "Expected" section in the panel with dashed/orange styling.
6. Navigate back a few months and confirm past months show no orange "expected" dots (everything's either posted or didn't happen).
7. Confirm `/spending` and `/recurring`'s month selectors still cannot navigate past the current month (regression check on Task 1).

- [ ] **Step 3: Confirm no console errors**

Check the browser console and terminal running `npm run dev` for runtime errors or React warnings.

- [ ] **Step 4: Report back**

If anything in the golden path looks wrong, fix it before considering this plan complete — this is a UI feature and type-checking/tests alone don't verify it actually looks and behaves right.
