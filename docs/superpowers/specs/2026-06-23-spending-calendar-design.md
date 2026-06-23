# Spending calendar — design

## Context

The app tracks spending by month (`/spending`) and recurring charges separately (`/recurring`), but there's no day-by-day view. The user wants a trading-journal-style calendar: each day is a colored square showing that day's net cash flow, click a day to see the transactions behind the number, and surface upcoming/past recurring charges for planning.

Transaction dates (`transactions.date`) are already the real transaction date — Plaid's `t.date` for synced accounts, the parsed statement date for Amex CSV imports (`lib/amex.ts`) — not a sync/registration timestamp. No schema change is needed to get real dates; the calendar just reads the existing field.

## Goals

1. New `/calendar` page: a month grid where each day square is filled with a color (red/green) sized by that day's net cash flow, like a trading P&L calendar.
2. Click a day to open a side panel listing that day's actual transactions, plus any forecasted recurring items expected on that day.
3. Surface recurring charges (auto-detected, manual, and committed income/expense items) as forecasts on future days within the viewed month, without double-counting once they've actually posted.

## Explicitly out of scope

- Forecasting beyond the currently-viewed month (no fixed 30/60-day rolling window) — navigate months to look further out, same as the existing `MonthSelector` pattern.
- Editing transactions or recurring rules from the calendar — it's a read/navigate surface. Editing stays on `/spending` (`TransactionList`) and `/recurring` (`RecurringChecklist`).
- Week or agenda views — month grid only.
- Any change to how transactions are synced, imported, or dated.

## Data layer

No schema migration. One new query in `lib/db/queries.ts`:

```ts
getCalendarMonth(db, year, month): Promise<{
  days: {
    date: string            // 'YYYY-MM-DD'
    netTotal: number        // sum of -amount over actual, non-pending, non-ignored txs that day (income positive, spend negative)
    actual: CalendarTxEntry[]
    expected: CalendarExpectedEntry[]
  }[]
  maxAbsNetTotal: number     // largest |netTotal| across the month's days, for heatmap scaling
}>
```

It composes three existing sources:

- **Actual entries** — `getTransactionsForMonth(db, year, month)`, grouped by `date`. A day's `netTotal` is the sum of `-amount` for that day's non-pending, non-ignored transactions (Plaid convention: positive `amount` = spend, negative = income/credit, so negating gives "income minus spend"). Ignored/pending transactions are excluded from the total but pending ones are still listed in the day's detail (consistent with how `/spending` currently treats pending elsewhere — confirm against `getTransactionsForMonth`'s existing `pending = 0` filter; pending transactions are already excluded there, so the calendar inherits the same behavior with no special-casing).
- **Expected entries** — from `getCommittedItemsWithStatus(db, year, month)` and `getRecurringMerchantsWithStatus(db, year, month)`, filtered to items where `confirmedAmount === null` (hasn't posted yet this month) **and** the projected day is `>= today` (so past months and already-elapsed days in the current month never show stale forecasts). Projected onto `expectedDay` / `dayOfMonth`, clamped to the month's last real day (e.g. day 31 in a 30-day month → day 30). `likelyCancelled` recurring merchants are excluded from forecasts.
  - This placement rule means: once an expected item posts, `confirmedAmount` becomes non-null and it stops being "expected" — it's already showing as an actual transaction on its real date instead. No double-counting.
- **`netTotal`** only sums actual entries. Expected/forecast amounts never move the day's headline number, since they haven't happened.

## Calendar grid UI

Trading-journal style month grid (Sun–Sat), reusing the existing `MonthSelector` for navigation. Each day square:

- **Has actual net activity**: full-square color fill, gradient-scaled by `|netTotal| / maxAbsNetTotal` (bigger swings = more saturated), red for negative net, green for positive net (tokens: `--negative` / `--positive`, blended toward white at low magnitude). Large bold centered amount (`formatCAD`), day number in a corner.
- **No actual activity** (net is exactly 0 / no transactions): neutral square — white/gray (`--surface` / `--hairline` border), day number only, no centered amount (or a faint "—").
- **Has expected-only entries** (no actual activity yet, e.g. an upcoming bill): stays neutral-colored (forecasts don't drive the fill), but gets a small corner dot/badge so upcoming items aren't invisible on the grid.

Color legend shown above or beside the grid: red = loss/spend day, green = gain/income day, yellow dot = upcoming expected item.

## Day detail — side panel

Click a day to open a panel — right-side on desktop, bottom sheet on mobile (consistent with the rest of the app's existing mobile/desktop split, e.g. `Sidebar.tsx`'s own desktop/mobile branching). Contents:

- Date header + that day's net total (colored).
- Actual transactions, reusing `TransactionRow` (red for spend, green for income — matches existing row coloring already in the component).
- Expected/forecast entries below, visually distinct (yellow tint, "expected" label, dashed border) — name, projected amount, source (recurring merchant / manual / committed item).
- Empty state if a day has neither (e.g. clicking a neutral day with only a stray ignored transaction).

## New files

- `app/calendar/page.tsx` — server component; parses `year`/`month` search params (same pattern as `app/spending/page.tsx`), calls `getCalendarMonth`, renders header + `MonthSelector` + `CalendarGrid`.
- `components/CalendarGrid.tsx` — client component; owns `selectedDate` state, renders the day squares, computes heatmap shading, opens `CalendarDayPanel` on click.
- `components/CalendarDayPanel.tsx` — side panel / bottom sheet; renders actual (`TransactionRow`) + expected entries for the selected day.
- `lib/db/queries.ts` — add `getCalendarMonth`.

## Navigation

- `components/NavLinks.tsx` — add `{ label: 'Calendar', href: '/calendar', icon: Calendar }` (lucide-react), inserted after "Spending".
- `components/ClientMobileTabBar.tsx` — add Calendar as a 5th tab (current 4: Overview, Spending, Budget, Invest). Not replacing an existing tab.

## Testing

- Unit tests in `__tests__/` (new `calendar.test.ts`, following `db.test.ts`'s conventions) covering `getCalendarMonth`: actual/expected merge, the "stops being expected once confirmed" dedup, day-of-month clamping for short months, and the `>= today` cutoff for forecasts.
- Manual verification in-browser: a month with a mix of spend/income days, a future month showing only forecasts, and a past month showing no forecasts.
