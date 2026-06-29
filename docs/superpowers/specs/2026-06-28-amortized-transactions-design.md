# Amortized (smoothed) transactions — design

**Date:** 2026-06-28
**Status:** Approved, implementing

## Problem

Some single transactions represent value that economically spans multiple months:
prepaid income (parents sending money meant to last N months), annual
subscriptions, semi-annual tuition, insurance. Today every analytics aggregate
books a transaction entirely in its posting month, so these lumps spike one month
and starve the rest. This makes the **savings rate** (a metric whose whole value is
month-over-month comparability) and the **trend charts** noisy.

## Decisions (from brainstorming)

- **Model:** even amortization, not envelope/drawdown. A lump is split into N equal
  monthly slices. The raw transaction is never altered — amortization is a pure
  analytics-layer transform.
- **Marking:** per-transaction, manual N (`spread_months`). Amounts and durations
  vary (parents' money is irregular), so no category defaults or committed-item
  coupling.
- **Direction:** forward, inclusive. Slice 0 lands in the posting month; slices
  1..N-1 in the following months.
- **Cash vs accrual split (critical):** amortization is an *accrual* lens. It must
  NOT touch cash-fact surfaces, or it creates phantom balances (e.g. a $1,000
  "spent" in a month no payment happened).
  - **Accrual (amortized):** spending trend, income trend, savings rate,
    budget-vs-actual.
  - **Cash (untouched, real posting month):** "Spent"/"Income" stat cards,
    `getSpendByAccount`, account balances, net worth, the transaction ledger.
- **Labeling:** every accrual surface is explicitly marked ("smoothed"/"averaged")
  so an accrual slice is never mistaken for cash.

## Data model

Add one nullable column to `transactions`:

- `spread_months INTEGER` — NULL or 1 = books entirely in posting month (default,
  every existing row). N > 1 = amortize over N months from the posting month.

No explicit start column; start is derived from `date`. Drizzle migration adds the
column with default NULL.

## Shared helper — `lib/amortize.ts`

Single source of truth for the math (mirrors the `spendInclusion()` "one shared
rule" principle):

```ts
type Slice = { year: number; month: number; amount: number }
// Expand one tx into per-(year,month) slices intersecting [rangeStart, rangeEnd].
expandAmortized(tx: { date: string; amount: number; spreadMonths: number | null },
                rangeStart: {year,month}, rangeEnd: {year,month}): Slice[]
```

- Even split in cents; the last slice absorbs the remainder so `Σ slices === amount`
  exactly (no penny drift).
- Sign-agnostic (income negative, expense positive).
- Slices outside the window are clipped, so a tx older than the visible range still
  contributes slices to in-range months.
- N null/<=1 → single slice in the posting month (passthrough).

Each call site keeps its existing SQL sum for normal rows (`spread_months` NULL/1)
and adds expanded slices for amortized rows, merged into the same month/category
buckets.

## Call sites

**Switch to accrual:** `getCategoryTrendMonths`, `getIncomeTrendMonths`,
spending-page savings-rate inputs, `getBudgetSummary`/`getCategoryBreakdown`.

**Stay cash (untouched):** `getMonthlySpend` (Spent card), `getSpendByAccount`,
balances, net worth, ledger.

## UI

- New control in `TransactionRow` ("Spread over N months") → `setTransactionSpread(txId, months)`
  server action writing `spread_months`, revalidating `/`, `/spending`, `/budget`.
- Spread rows show a subtle badge (e.g. "÷6") in the ledger.
- Accrual surfaces gain a "· smoothed" subtitle/footnote.

## Testing

- Unit (`expandAmortized`): single month, exact division, remainder distribution,
  out-of-window clipping, negative/positive amounts, N=1 passthrough.
- Integration: a spread tx yields equal slices across trend + budget and is absent
  from the cash "Spent" card.
