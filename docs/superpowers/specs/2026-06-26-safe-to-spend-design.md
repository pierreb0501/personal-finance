# Safe to spend — design

> **⚠️ SUPERSEDED (2026-06-27)** by `2026-06-27-category-budget-model-design.md`. After visual review the single-allowance + cash-backstop approach was dropped in favour of category budgets as the single source of truth (fixed/flexible labels). Kept for history.

## Context

The dashboard (`app/page.tsx`) and spending page (`app/spending/page.tsx`) already show a
primitive "safe to spend": a user-set `allowance` setting (default `3000`), the month's spend
(`getMonthlySpend`), and `remaining = allowance − spend` rendered as a progress bar. This number
has one flaw that makes it misleading: it only subtracts what has **already been spent**, never
what is **about to be spent** on bills the app already knows are coming. Early in the month it
reads optimistically high (e.g. "$2,800 remaining" on the 3rd while $2,000 of rent and bills are
still due), and only tells the truth once everything has posted — too late to guide a decision.

This feature turns that number into a forward-looking, trustworthy "safe to spend" figure: how
much **discretionary** money the user can still spend this month without blowing their plan, with
upcoming bills surfaced separately so they are visible but do not pollute the decision number.

All inputs already exist. No schema migration, no new Plaid work, no new synced data.

## Decisions (locked during brainstorming)

These were settled with the user and are not open questions:

1. **Time window: calendar month.** Resets on the 1st. Matches existing monthly budgets/calendar.
2. **Anchor: a user-set monthly limit, not raw cash.** Cash is only a backstop (see below). This
   is what prevents "$20K in the bank → spend $15K" nonsense — the number can never exceed the
   limit the user chose.
3. **Bills are OUT of the limit (fun-money model).** The limit is the user's *discretionary*
   spending cap. Non-negotiable bills (rent, utilities, subscriptions) are not part of it; they
   are tracked separately and shown as a secondary line. Rationale: the number's only job is to
   guide discretionary decisions — the lever the user controls — and a fun-money cap is easier to
   set, psychologically stable, and motivating. The app already separates bills (committed items +
   recurring) from discretionary spend, so this is cheap to compute.
4. **Cash backstop included in v1.** The final number is capped by what the user's cash can
   actually cover, so an "honest number" can never exceed the bank balance.
5. **Credit card debt counts as money already spent** — subtracted in the cash backstop.

## Goals

1. A `getSafeToSpend(db, year, month)` query that assembles the figure from existing data.
2. A `SafeToSpendCard` component replacing the current allowance card on the dashboard
   (`app/page.tsx`) — a hero number with a tap/hover breakdown so it is auditable and trusted.
3. Reframe the `allowance` setting as the **discretionary monthly limit** consistently across the
   app, and update the spending page (`app/spending/page.tsx`) to the discretionary basis so the
   two pages never disagree.
4. A new optional **buffer** setting (default `0`) used only by the cash backstop.
5. Unit tests for the math, covering the edge cases listed below.

## Explicitly out of scope

- Goals/savings targets and alerts/notifications — separate Tier-1 features, brainstormed later.
- Multi-month or rolling 30-day forecasting — calendar month only (navigate months as elsewhere).
- Per-account selection of which balances count as "spendable cash" — v1 uses all depository
  accounts. A future setting can refine this.
- Any change to how bills/recurring are detected or matched. This feature *consumes* the existing
  committed-items and recurring machinery; it does not modify the detection logic.
- Changing the meaning of `getMonthlySpend` itself. Discretionary spend is derived from it, not a
  replacement for it.

## The math

All amounts are positive dollars. Plaid convention in this codebase: a transaction `amount > 0`
is spend/outflow, `amount < 0` is income/credit.

### Headline number

```
discretionary_spent = monthly_spend − paid_bills
safe_to_spend       = monthly_limit − discretionary_spent
                    = monthly_limit − (monthly_spend − paid_bills)
```

- `monthly_limit` — the `allowance` setting (default `3000`), reframed as the discretionary cap.
- `monthly_spend` — `getMonthlySpend(db, year, month)`, unchanged (total outflows this month,
  excluding pending/ignored).
- `paid_bills` — the sum of this month's transactions that have been matched to a committed
  **expense** item or an active recurring merchant (i.e. bills that have already posted). These
  are subtracted out so bills do not consume the discretionary limit.

### Secondary line (informational only, not subtracted from headline)

```
bills_still_due = Σ expected amounts of committed expense items not yet confirmed this month
                + Σ avg amounts of recurring merchants not yet confirmed this month (excl. likelyCancelled)
```

Shown as "Bills still due this month: $X" so total cashflow stays visible without polluting the
discretionary number.

### Cash backstop (the safety cap)

```
spendable_cash = Σ depository balanceAvailable (fallback balanceCurrent)
credit_owed    = Σ credit card balances owed            (getCreditCardBalances)
cash_safe      = spendable_cash − credit_owed − bills_still_due − buffer

final_safe_to_spend = min(safe_to_spend, cash_safe)
```

For a user with ample cash, `safe_to_spend` is always the lower of the two and the backstop never
binds. For a tight month, `cash_safe` binds and stops the number from telling the user to spend
money they do not have. `buffer` defaults to `0`.

### Computing `paid_bills` without double-counting

`paid_bills` must be the sum over a **deduped set of transactions** — a single posted transaction
could be matched by both a committed item and a recurring merchant, and must only be counted once.

Implementation approach: add a helper (e.g. `getBillTransactionIds(db, year, month)`) that returns
the set of transaction IDs matched to any committed **expense** item or active recurring merchant
this month, reusing the existing matching logic already in `getCommittedItemsWithStatus` and
`findBestRecurringMatch`/`getRecurringMerchantsWithStatus` rather than duplicating it. `paid_bills`
is then the sum of `amount` over that deduped ID set (positive/outflow amounts only). This keeps
the calendar, the recurring page, and this number all reading from the same matching rules.

Income-type committed items are never bills and are excluded from `paid_bills` and
`bills_still_due`.

### Risk: bill-match precision (the one number that can be wrong)

The discretionary figure is only as good as the bill-matching. The existing matchers are
**category-label based** (with an optional keyword narrowing). Two failure modes follow, and both
push `paid_bills` too high, which makes `safe_to_spend` read *too generous* — the dangerous
direction:

- `getCommittedItemsWithStatus` sums **all** category-matched transactions for a committed item, so
  a discretionary purchase that happens to share a bill's category (e.g. a one-off "Utilities"
  charge) gets counted as a paid bill and wrongly freed from the discretionary limit.
- A broad category with no keyword can sweep in unrelated transactions.

Resolution for v1: `getBillTransactionIds` should cap each bill's contribution to its **best single
match** (the recurring approach in `findBestRecurringMatch` — the transaction closest to the
expected/avg amount), rather than summing every category match. This trades a small chance of
under-counting a genuinely-split bill for protection against the worse failure (over-counting that
inflates safe-to-spend). The committed-status *display* on `/recurring` is unchanged; only the
bill-tx set feeding this calculation uses the stricter best-match rule. A test (#6 below, extended)
asserts that a discretionary transaction sharing a bill category is **not** absorbed into
`paid_bills`.

## Return shape

```ts
getSafeToSpend(db, year, month): Promise<{
  monthlyLimit: number        // the discretionary cap (allowance setting)
  monthlySpend: number        // total outflows this month
  paidBills: number           // bill transactions already posted this month (deduped)
  discretionarySpent: number  // monthlySpend − paidBills
  billsStillDue: number       // unconfirmed committed-expense + recurring this month
  spendableCash: number       // Σ depository available/current
  creditOwed: number          // Σ credit card balances
  buffer: number              // buffer setting (default 0)
  cashSafe: number            // spendableCash − creditOwed − billsStillDue − buffer
  limitSafe: number           // monthlyLimit − discretionarySpent
  safeToSpend: number         // min(limitSafe, cashSafe)  ← the headline
  backstopBinding: boolean    // true when cashSafe < limitSafe (UI can explain why it's low)
}>
```

Returning the components (not just the final number) is what makes the breakdown UI possible and
the number auditable.

## Settings

- **Monthly limit** — the existing `allowance` setting key (kept as-is in storage to avoid a
  migration), reframed in UI copy as "Monthly spending limit (discretionary)". The existing
  `AllowanceEditor` component and `app/actions.ts` `upsertSetting(db, 'allowance', …)` are reused;
  only the user-facing label changes.
- **Buffer** — a new setting key `safe_to_spend_buffer` (default `0`), edited alongside the limit.
  Only affects the cash backstop. v1 may ship with a sensible default and a minimal editor; the
  buffer editor can reuse the `AllowanceEditor` pattern.

## UI

### Dashboard (`app/page.tsx`) — `SafeToSpendCard`

Replaces the current allowance/remaining card. Hero treatment:

```
┌─────────────────────────────────────────────┐
│  SAFE TO SPEND                                │
│  $1,700                                       │
│  discretionary, left this month               │
│  [=========------------]  $1,300 of $3,000 used │
│                                               │
│  Bills still due this month        $1,400     │
│  ▸ breakdown                                  │
│    Monthly limit              $3,000          │
│    − Discretionary spent      −$1,300         │
│    = Safe to spend             $1,700         │
└─────────────────────────────────────────────┘
```

- Headline = `safeToSpend`, large, in `formatCAD`.
- Progress bar = `discretionarySpent / monthlyLimit` (reuse existing `ProgressBar`).
- "Bills still due this month" = `billsStillDue`, always visible as a secondary line.
- Expandable breakdown shows the limit-based lines. When `backstopBinding` is true, the breakdown
  additionally shows the cash backstop lines and a short note ("limited by available cash"), so a
  surprisingly low number is explained rather than mysterious.
- Negative `safeToSpend` (over the discretionary limit) renders as e.g. "−$200 over" in the
  negative color, not a misleading positive bar.

### Spending page (`app/spending/page.tsx`)

Updated to the discretionary basis for consistency: its allowance bar now reads
`discretionarySpent` vs `monthlyLimit` using the same `getSafeToSpend` data, so it agrees with the
dashboard. The page's existing projected-spend logic is recomputed on the discretionary figure.

## Testing

Unit tests for the math (pure function over fixture inputs where possible, or query tests against
the in-memory test DB used elsewhere):

1. **Happy path** — limit 3000, spend 1300 of which 0 bills → safe 1700.
2. **Bills paid are excluded** — spend 2000 of which 1400 matched bills → discretionary 600,
   safe 2400 (bills don't eat the limit).
3. **Bills still due** — surfaced in `billsStillDue`, and does *not* change `limitSafe`.
4. **Cash backstop binds** — low `spendableCash` so `cashSafe < limitSafe` → headline = `cashSafe`,
   `backstopBinding === true`.
5. **Credit card debt** — reduces `cashSafe`; verify it's subtracted exactly once.
6. **Dedup + precision** — a transaction matched by both a committed item and a recurring merchant
   is counted once in `paidBills`; and a discretionary transaction merely sharing a bill's category
   is NOT absorbed into `paidBills` (best-match rule).
7. **Over limit** — discretionary spend > limit → `limitSafe` negative, surfaced as "over".
8. **Buffer** — non-zero buffer reduces `cashSafe` only, never `limitSafe`.
9. **Income items excluded** — committed income items never appear in `paidBills`/`billsStillDue`.
10. **Defaults** — missing limit setting falls back to 3000; missing buffer falls back to 0.

## What gets built (summary)

1. `lib/db/queries.ts`: `getSafeToSpend(db, year, month)` + `getBillTransactionIds(db, year, month)`
   helper (deduped bill-tx matching reused from existing committed/recurring logic).
2. `components/SafeToSpendCard.tsx`: new dashboard hero card with breakdown.
3. `app/page.tsx`: swap the allowance card for `SafeToSpendCard`.
4. `app/spending/page.tsx`: switch its allowance bar to the discretionary basis via `getSafeToSpend`.
5. Settings: reframe `allowance` label; add `safe_to_spend_buffer` setting + minimal editor.
6. Tests per the list above.

No schema migration. No change to sync, import, or bill-detection logic.
