# Category-budget model (fixed / flexible) — design

## Context

This **supersedes** `docs/superpowers/specs/2026-06-26-safe-to-spend-design.md`. During visual review of the safe-to-spend build, two things became clear:

1. The app already has a full bottom-up budget — the user maintains nine `category_budgets` summing to ~$3,849 that already include rent, utilities, and subscriptions. The separate `allowance` setting (~$4,000) was a near-duplicate of that, set in a second place and never reconciled. **Maintaining two budgets is the actual reason the feature felt "not straightforward."**
2. The user budgets *every* category (bills included), i.e. they think in totals, not in "fun money on top of bills." The cash-backstop machinery was inert for them and added complexity without payoff.

So the model changes: **category budgets become the single source of truth.** There is no separate allowance and no cash backstop. A new per-category **fixed / flexible / savings** label powers a bills-vs-discretionary split and one genuinely useful derived number — *flexible remaining* ("how much can I still spend freely this month").

## Decisions (locked with the user during this conversation)

1. **Single source of truth = `category_budgets`.** Total budget = the sum of category budgets. Delete the `allowance` setting and the `safe_to_spend_buffer` setting.
2. **No safe-to-spend cash mechanics.** Remove the cash backstop, credit-card subtraction, and transaction-level bill *matching*. The fixed/flexible split comes from **category labels the user sets**, not from auto-matching committed/recurring transactions.
3. **Each category is labeled `fixed | flexible | savings`** — a category-level attribute (not per-month).
4. **Budgets and labels are independent of each other.** Every category (fixed *or* flexible) can have a budget; the label only decides which subtotal the budget and its spending roll into. A flexible category with a budget is the normal case.
5. **Spending is always counted in full** from actuals across all categories. Budgets define the *plan*; the gap between plan and actual (including spend in unbudgeted categories) is always shown, never hidden.
6. **`flexible_remaining` counts ALL flexible spending** — budgeted categories *and* flexible categories with no budget — so unbudgeted flexible spend can never make "money left to spend freely" look falsely rosy.
7. **Savings is its own label** (the user's `MONTHLY_INVESTMENT $500` is pay-yourself-first, not a bill or flexible spend). This also sets up the future Goals feature. *(Open for user confirmation at review: keep `savings` as a third label, or fold into `fixed` for v1.)*

## The model

For a given `(year, month)`:

- **Inputs:** `category_budgets` (planned per category), category actuals from `getCategoryBreakdown` (spend per category, all categories), and a category→kind map from the new `category_labels` table (default `flexible` when unlabeled).
- **Derived figures:**

```
totalBudget       = Σ planned (all categories)
billsBudget       = Σ planned where kind = fixed
flexibleBudget    = Σ planned where kind = flexible
savingsBudget     = Σ planned where kind = savings

totalSpent        = Σ spend (all categories)
flexibleSpent     = Σ spend where kind = flexible        ← includes flexible categories with NO budget
flexibleRemaining = flexibleBudget − flexibleSpent       ← can go negative (overspent), shown as "over"

unbudgetedSpend   = Σ spend where the category has no budget this month
unbudgetedCount   = number of such categories
```

- **The one behavioral number:** `flexibleRemaining` = "how much I can still spend freely this month." Equivalent to summing per-category `(budget − spent)` over flexible categories — a category with no budget contributes `(0 − spent)`, i.e. it pulls the number down. Pool view and per-envelope view give the same total by construction.
- **Income is excluded.** Income-type categories (those used by income `committed_items`, e.g. `INCOME`, `Tax Return`) are not spend buckets and are excluded from every total above. (The user currently has a `Tax Return` budget row that is really income — see Edge cases.)

## Data model changes

**New table** (`lib/db/schema.ts`) + migration (`drizzle-kit generate`):

```ts
export const categoryLabels = sqliteTable('category_labels', {
  category: text('category').primaryKey(),  // effective category name (customCategory ?? category)
  kind: text('kind').notNull(),             // 'fixed' | 'flexible' | 'savings'
})
```

- Keyed by the **effective category name** (the same string space `category_budgets.category` and `getCategoryBreakdown` use), so it covers both built-in Plaid categories (e.g. `RENT_AND_UTILITIES`) and custom categories.
- **Default when no row exists: `flexible`.** Most spending is discretionary; bills are the minority the user explicitly marks fixed.
- **Suggested pre-fill (one-time, user-confirmable, not forced):** categories used by expense `committed_items` or active recurring merchants → suggest `fixed`; the user's `MONTHLY_INVESTMENT` → `savings`. The user can override any label.

**Removed:**
- `settings` rows `allowance` and `safe_to_spend_buffer` (and their editors/actions).

## What gets removed from the current branch

The `feat/safe-to-spend` branch (to be renamed `feat/budget-model`) added artifacts this model no longer needs. The implementation plan must remove them:

- `getSafeToSpend` and `getBillTransactionIds` in `lib/db/queries.ts` (the cash-backstop + bill-matching logic). *Note:* the committed-items / recurring machinery itself stays — it still powers `/calendar` and `/recurring`; only the safe-to-spend consumers are removed.
- `components/SafeToSpendCard.tsx`, `components/BufferEditor.tsx`.
- `setBuffer` action; the `saveAllowance`/`saveIncome` `await` fix (commit `d7da546`) is a genuine bug fix and **stays** even though `saveAllowance` is being removed — `saveIncome` keeps it.
- `__tests__/safe-to-spend.test.ts`.
- Revert the dashboard/spending wiring that pointed at `getSafeToSpend`; re-point at the new budget summary.

Nothing was merged to `main`, so this is free to do. Keeping the branch's good ideas (a clear derived "what can I spend" number; the dashboard restore of the investments/savings-rate widgets) and dropping the machinery.

## UI

### `/budget` — the source of truth (primary surface)

The existing `app/budget/page.tsx` (per-category planned vs actual) gains:

- **A `fixed | flexible | savings` control on each category row** (writes to `category_labels`).
- **Grouped subtotals:** a "Bills (fixed)" section, a "Flexible" section, a "Savings" section, each with its budgeted subtotal and actual, then a **Total budget** line.
- **A "Flexible remaining" figure** = `flexibleBudget − flexibleSpent`, prominently shown (this is the day-to-day number).
- **An "Unbudgeted spending" callout** when `unbudgetedSpend > 0`: e.g. *"Unbudgeted: $320 across 2 categories — set a budget?"* linking to those rows. (The page already lists categories that have spend but no budget; this makes the total explicit.)

### Dashboard (`app/page.tsx`) — compact summary

Replace `SafeToSpendCard` with a compact budget summary card derived from the same data:
- **Total budget** and **spent** (progress bar), plus **Flexible remaining** as the headline behavioral number, and the unbudgeted nudge if any.
- Keep the restored **Investments value + today's delta + savings-rate** card (from branch commit `9780149`).

### `/spending` (`app/spending/page.tsx`) — fix the sparse stat row the user flagged

- Replace the "Discretionary limit / allowance" card with a **Total budget** card showing the **Bills + Flexible (+ Savings) = Total** breakdown.
- Give each stat card a context sub-line so there is no dead space (e.g. "Spent — 80% of budget, $X left"; "Income — vs spent"; "Saved — savings rate"). Tighten card height.
- All figures derive from the new budget model (no `allowance`).

## Edge cases

- **Flexible category, no budget, has spend:** contributes `$0` to `totalBudget`/`flexibleBudget`, but its spend counts in `flexibleSpent` (so it lowers `flexibleRemaining`) and in `unbudgetedSpend`; the row is flagged "spent $X · no budget" with a set-budget nudge. (Decision #6.)
- **Fixed category, no budget, has spend:** same treatment — counts in `totalSpent` and `unbudgetedSpend`, flagged; does not affect `flexibleRemaining`.
- **`flexibleRemaining` negative:** rendered as "$X over" in the negative color, not a misleading positive.
- **Income miscategorized as a budget** (user's `Tax Return` row): income categories are excluded from all spend/budget buckets. The plan should detect income categories via income `committed_items` and skip them; optionally surface a gentle "this looks like income, not a budget" hint (out of scope for v1 — just exclude).
- **`totalBudget` = 0 (no budgets set):** show an empty-state prompting the user to budget; avoid divide-by-zero in the progress ratio.
- **Unlabeled category:** treated as `flexible` (default), so it participates in `flexibleRemaining` until the user labels it otherwise.

## Out of scope

- Goals/savings targets and alerts/notifications (later Tier-1 features). The `savings` label is groundwork only.
- Cash-balance awareness / overdraft protection (deliberately dropped — see Decision #2).
- Multi-currency, rollover of unspent budget between months, per-account budgeting.
- Changing how transactions are categorized, synced, or how committed/recurring detection works.

## Testing

Unit tests (pure derivation over fixture inputs, mirroring `__tests__/db.test.ts`'s in-memory DB):

1. `totalBudget` / `billsBudget` / `flexibleBudget` / `savingsBudget` sum correctly by label.
2. `flexibleRemaining` = flexibleBudget − flexibleSpent for budgeted flexible categories.
3. **Flexible category with no budget**: its spend reduces `flexibleRemaining` and appears in `unbudgetedSpend`; `flexibleBudget` unchanged.
4. **Fixed category with no budget + spend**: in `unbudgetedSpend`/`totalSpent`, not in `flexibleRemaining`.
5. `flexibleRemaining` goes negative when overspent.
6. Unlabeled category defaults to `flexible`.
7. Income category (from an income committed item) excluded from all totals.
8. `unbudgetedSpend`/`unbudgetedCount` correct with a mix of budgeted and unbudgeted spend.
9. Empty state: no budgets → totals 0, no divide-by-zero.
10. Label persistence: setting/changing a category's kind updates the derived buckets.
