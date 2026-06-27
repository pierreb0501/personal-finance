# Safe to Spend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's misleading allowance/remaining bar with a forward-looking "safe to spend" number: a user's discretionary monthly limit minus discretionary spend, capped by what their cash can actually cover, with upcoming bills shown separately.

**Architecture:** Pure read-layer addition. A `getBillTransactionIds` helper deduplicates which posted transactions are bills (best single match per bill), `getSafeToSpend` assembles the figure from existing queries, and a `SafeToSpendCard` renders it on the dashboard. The existing `allowance` setting is reframed as the discretionary limit; a new `safe_to_spend_buffer` setting feeds only the cash backstop. No schema migration.

**Tech Stack:** Next.js 16 (App Router, RSC), Drizzle ORM, Turso/libsql (better-sqlite3 in tests), Jest (node env), Tailwind, Recharts.

**Spec:** `docs/superpowers/specs/2026-06-26-safe-to-spend-design.md`
**Branch:** `feat/safe-to-spend` (already checked out)

---

## File Structure

- **Modify** `lib/db/queries.ts` — add `getBillTransactionIds(db, year, month)` and `getSafeToSpend(db, year, month)`. Both compose existing queries; no new file needed (all read queries already live here).
- **Create** `__tests__/safe-to-spend.test.ts` — unit tests for the two new functions against an in-memory DB (mirrors `__tests__/db.test.ts`).
- **Create** `components/SafeToSpendCard.tsx` — dashboard hero card with breakdown.
- **Create** `components/BufferEditor.tsx` — minimal editor for the buffer setting (mirrors `components/AllowanceEditor.tsx`).
- **Modify** `app/page.tsx` — swap the allowance card for `SafeToSpendCard`.
- **Modify** `app/spending/page.tsx` — switch its allowance bar to the discretionary basis via `getSafeToSpend`.
- **Modify** `app/actions.ts` — add a server action to persist the buffer setting.
- **Modify** `components/AllowanceEditor.tsx` (copy only) — relabel "allowance" → discretionary monthly limit.

**Testing reality:** Jest runs in `jest-environment-node` (no jsdom/RTL in this repo). Pure data functions are TDD'd with real tests. UI components are verified with `npx tsc --noEmit` + `npx next build` + a manual visual check — there is no component-render test harness, and adding one is out of scope.

---

## Task 1: `getBillTransactionIds` helper

Identifies which of this month's posted outflow transactions are bills, by giving each committed-expense item and recurring merchant its **single best-match** transaction (closest amount within the bill's category/keyword), claiming each transaction at most once. This is the dedup + precision rule from the spec.

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `__tests__/safe-to-spend.test.ts`

- [ ] **Step 1: Write the test file scaffold + first failing test**

Create `__tests__/safe-to-spend.test.ts`:

```ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getBillTransactionIds, getSafeToSpend } from '@/lib/db/queries'

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

// Seeds one item + one depository account so transactions have a valid FK.
async function seedAccount(db: DB, opts: { type?: string; balanceCurrent?: number; balanceAvailable?: number | null } = {}) {
  await db.insert(schema.items).values({
    id: 'item1', plaidItemId: 'p1', accessToken: 'tok', cursor: null,
    institutionName: 'Test Bank', createdAt: now(), status: 'ok',
  }).run()
  await db.insert(schema.accounts).values({
    id: 'acc1', itemId: 'item1', plaidAccountId: 'pa1', name: 'Checking',
    type: opts.type ?? 'depository', subtype: 'checking',
    balanceCurrent: opts.balanceCurrent ?? 5000,
    balanceAvailable: opts.balanceAvailable === undefined ? 5000 : opts.balanceAvailable,
    isoCurrencyCode: 'CAD', updatedAt: now(),
  }).run()
}

let txSeq = 0
async function seedTx(db: DB, t: { amount: number; date: string; category: string; merchantName?: string | null; customCategory?: string | null; accountId?: string }) {
  txSeq += 1
  await db.insert(schema.transactions).values({
    id: `tx${txSeq}`, accountId: t.accountId ?? 'acc1', amount: t.amount, date: t.date,
    merchantName: t.merchantName ?? null, rawName: t.merchantName ?? null,
    category: t.category, categoryDetailed: t.category, pending: 0,
    customCategory: t.customCategory ?? null, ignored: 0,
  }).run()
  return `tx${txSeq}`
}

describe('getBillTransactionIds', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  it('claims the single best-match transaction for a committed expense item', async () => {
    await seedAccount(db)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 1,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const rentId = await seedTx(db, { amount: 1400, date: '2026-06-01', category: 'Rent' })
    // A discretionary charge that shares NO category with any bill — must NOT be claimed.
    await seedTx(db, { amount: 50, date: '2026-06-02', category: 'Dining' })

    const ids = await getBillTransactionIds(db, 2026, 6)
    expect(ids.has(rentId)).toBe(true)
    expect(ids.size).toBe(1)
  })

  it('does NOT absorb a discretionary transaction that merely shares a bill category', async () => {
    await seedAccount(db)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Hydro', type: 'expense', expectedAmount: 120, expectedDay: 15,
      merchantName: null, category: 'Utilities', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const billId = await seedTx(db, { amount: 120, date: '2026-06-15', category: 'Utilities' })
    // Same category, very different amount — the bill should claim only its best match.
    await seedTx(db, { amount: 600, date: '2026-06-16', category: 'Utilities' })

    const ids = await getBillTransactionIds(db, 2026, 6)
    expect(ids.has(billId)).toBe(true)
    expect(ids.size).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest safe-to-spend -t "getBillTransactionIds"`
Expected: FAIL — `getBillTransactionIds is not a function` (not yet exported).

- [ ] **Step 3: Implement `getBillTransactionIds`**

Add to `lib/db/queries.ts`. Ensure `inArray` is in the `drizzle-orm` import (used in Task 2). This function reuses `getCommittedItems`, `isItemDueInMonth`, `getRecurringMerchants`, and `monthBounds`, all already in this file.

```ts
// Returns the set of this-month transaction IDs that represent bills (committed
// expense items + recurring merchants). Each bill claims at most ONE transaction
// — its best amount match within the bill's category (optionally narrowed by
// keyword) — and each transaction is claimed at most once. Best-single-match
// (rather than summing every category match) prevents a discretionary purchase
// that merely shares a bill's category from being counted as a paid bill, which
// would inflate "safe to spend". See spec "Risk: bill-match precision".
export async function getBillTransactionIds(db: DB, year: number, month: number): Promise<Set<string>> {
  const { start, end } = monthBounds(year, month)

  const txs = await db
    .select({
      id: schema.transactions.id,
      amount: schema.transactions.amount,
      merchantName: schema.transactions.merchantName,
      category: schema.transactions.category,
      customCategory: schema.transactions.customCategory,
    })
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.date, start),
        sql`${schema.transactions.date} <= ${end}`,
        sql`${schema.transactions.amount} > 0`,
        eq(schema.transactions.pending, 0),
        eq(schema.transactions.ignored, 0),
      ),
    )
    .all()

  const billIds = new Set<string>()
  const effCat = (t: { category: string; customCategory: string | null }) => t.customCategory ?? t.category

  const claim = (category: string, keyword: string | null, expected: number) => {
    let pool = txs.filter((t) => !billIds.has(t.id) && effCat(t) === category)
    if (keyword && pool.length > 0) {
      const kw = keyword.toLowerCase()
      const narrowed = pool.filter((t) => t.merchantName?.toLowerCase().includes(kw) ?? false)
      if (narrowed.length > 0) pool = narrowed
    }
    if (pool.length === 0) return
    const best = pool.sort((a, b) => Math.abs(a.amount - expected) - Math.abs(b.amount - expected))[0]
    billIds.add(best.id)
  }

  const committed = (await getCommittedItems(db)).filter(
    (i) => i.type === 'expense' && isItemDueInMonth(i, year, month),
  )
  for (const item of committed) claim(item.category, item.merchantName, item.expectedAmount)

  const recurring = await getRecurringMerchants(db)
  for (const m of recurring) claim(m.category, m.merchantName, m.avgAmount)

  return billIds
}
```

- [ ] **Step 4: Run to verify both tests pass**

Run: `npx jest safe-to-spend -t "getBillTransactionIds"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts __tests__/safe-to-spend.test.ts
git commit -m "feat: getBillTransactionIds helper (best-match bill tx dedup)"
```

---

## Task 2: `getSafeToSpend` query

Assembles the headline number, the secondary bills line, and the cash backstop from existing queries plus Task 1.

**Files:**
- Modify: `lib/db/queries.ts`
- Test: `__tests__/safe-to-spend.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `__tests__/safe-to-spend.test.ts`:

```ts
describe('getSafeToSpend', () => {
  let db: DB
  beforeEach(() => { db = createTestDb(); txSeq = 0 })

  async function setLimit(v: number) {
    await db.insert(schema.settings).values({ key: 'allowance', value: String(v) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(v) } }).run()
  }
  async function setBuffer(v: number) {
    await db.insert(schema.settings).values({ key: 'safe_to_spend_buffer', value: String(v) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(v) } }).run()
  }

  it('happy path: limit minus discretionary spend, backstop not binding', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await seedTx(db, { amount: 1300, date: '2026-06-05', category: 'Dining' })

    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.discretionarySpent).toBe(1300)
    expect(r.limitSafe).toBe(1700)
    expect(r.safeToSpend).toBe(1700)
    expect(r.backstopBinding).toBe(false)
  })

  it('paid bills are excluded from discretionary spend', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 1,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    await seedTx(db, { amount: 1400, date: '2026-06-01', category: 'Rent' })   // bill
    await seedTx(db, { amount: 600, date: '2026-06-05', category: 'Dining' })  // discretionary

    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.paidBills).toBe(1400)
    expect(r.discretionarySpent).toBe(600)
    expect(r.limitSafe).toBe(2400)
  })

  it('cash backstop binds when cash cannot cover the limit number', async () => {
    await seedAccount(db, { balanceCurrent: 800, balanceAvailable: 800 })
    await setLimit(3000)
    // no spend → limitSafe 3000, but only 800 cash → backstop wins
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(3000)
    expect(r.cashSafe).toBe(800)
    expect(r.safeToSpend).toBe(800)
    expect(r.backstopBinding).toBe(true)
  })

  it('credit card debt reduces the cash backstop exactly once', async () => {
    await seedAccount(db, { balanceCurrent: 2000, balanceAvailable: 2000 })
    await db.insert(schema.accounts).values({
      id: 'card1', itemId: 'item1', plaidAccountId: 'pa-card', name: 'Visa',
      type: 'credit', subtype: 'credit card', balanceCurrent: 500, balanceAvailable: null,
      isoCurrencyCode: 'CAD', updatedAt: now(),
    }).run()
    await setLimit(3000)
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.creditOwed).toBe(500)
    expect(r.cashSafe).toBe(1500) // 2000 - 500 - 0 bills - 0 buffer
  })

  it('buffer reduces only the cash backstop, never the limit number', async () => {
    await seedAccount(db, { balanceCurrent: 2000, balanceAvailable: 2000 })
    await setLimit(3000)
    await setBuffer(300)
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(3000)
    expect(r.cashSafe).toBe(1700) // 2000 - 0 - 0 - 300
  })

  it('over-limit produces a negative limitSafe', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(1000)
    await seedTx(db, { amount: 1200, date: '2026-06-05', category: 'Dining' })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.limitSafe).toBe(-200)
  })

  it('defaults: missing limit -> 3000, missing buffer -> 0', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.monthlyLimit).toBe(3000)
    expect(r.buffer).toBe(0)
  })

  it('unpaid bills are surfaced in billsStillDue without lowering limitSafe', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Rent', type: 'expense', expectedAmount: 1400, expectedDay: 28,
      merchantName: null, category: 'Rent', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    // No matching Rent transaction this month → still due.
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.billsStillDue).toBe(1400)
    expect(r.limitSafe).toBe(3000) // headline untouched by unpaid bills
  })

  it('committed income items never count as bills', async () => {
    await seedAccount(db, { balanceCurrent: 10000, balanceAvailable: 10000 })
    await setLimit(3000)
    await db.insert(schema.committedItems).values({
      id: 'c1', name: 'Paycheck', type: 'income', expectedAmount: 4000, expectedDay: 30,
      merchantName: null, category: 'Income', groupName: null, createdAt: now(), intervalMonths: 1,
      anchorYear: null, anchorMonth: null,
    }).run()
    const r = await getSafeToSpend(db, 2026, 6)
    expect(r.billsStillDue).toBe(0) // income excluded
    expect(r.paidBills).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest safe-to-spend -t "getSafeToSpend"`
Expected: FAIL — `getSafeToSpend is not a function`.

- [ ] **Step 3: Implement `getSafeToSpend`**

Add to `lib/db/queries.ts`. Add `inArray` to the `drizzle-orm` import if absent. Reuses `getSetting`, `getMonthlySpend`, `getCommittedItemsWithStatus`, `getRecurringMerchantsWithStatus`, `getAllAccounts`, `getCreditCardBalances`, all already in this file.

```ts
export type SafeToSpend = {
  monthlyLimit: number
  monthlySpend: number
  paidBills: number
  discretionarySpent: number
  billsStillDue: number
  spendableCash: number
  creditOwed: number
  buffer: number
  cashSafe: number
  limitSafe: number
  safeToSpend: number
  backstopBinding: boolean
}

export async function getSafeToSpend(db: DB, year: number, month: number): Promise<SafeToSpend> {
  const monthlyLimit = Number((await getSetting(db, 'allowance')) ?? '3000')
  const buffer = Number((await getSetting(db, 'safe_to_spend_buffer')) ?? '0')
  const monthlySpend = await getMonthlySpend(db, year, month)

  const billIds = await getBillTransactionIds(db, year, month)
  let paidBills = 0
  if (billIds.size > 0) {
    const r = await db
      .select({ total: sql<number>`COALESCE(SUM(${schema.transactions.amount}), 0)` })
      .from(schema.transactions)
      .where(inArray(schema.transactions.id, Array.from(billIds)))
      .get()
    paidBills = r?.total ?? 0
  }

  const committedStatus = await getCommittedItemsWithStatus(db, year, month)
  const recurringStatus = await getRecurringMerchantsWithStatus(db, year, month)
  const committedDue = committedStatus
    .filter((i) => i.type === 'expense' && i.confirmedAmount === null)
    .reduce((s, i) => s + i.expectedAmount, 0)
  const recurringDue = recurringStatus
    .filter((r) => r.confirmedAmount === null && !r.likelyCancelled)
    .reduce((s, r) => s + r.avgAmount, 0)
  const billsStillDue = committedDue + recurringDue

  const accounts = await getAllAccounts(db)
  const spendableCash = accounts
    .filter((a) => a.type === 'depository')
    .reduce((s, a) => s + (a.balanceAvailable ?? a.balanceCurrent), 0)
  const creditOwed = (await getCreditCardBalances(db)).reduce((s, c) => s + c.balance, 0)

  const discretionarySpent = monthlySpend - paidBills
  const limitSafe = monthlyLimit - discretionarySpent
  const cashSafe = spendableCash - creditOwed - billsStillDue - buffer
  const safeToSpend = Math.min(limitSafe, cashSafe)

  return {
    monthlyLimit, monthlySpend, paidBills, discretionarySpent, billsStillDue,
    spendableCash, creditOwed, buffer, cashSafe, limitSafe, safeToSpend,
    backstopBinding: cashSafe < limitSafe,
  }
}
```

> **Note on `billsStillDue` double-count:** if the same bill is both a committed item and an auto-detected recurring merchant, it can be added twice here. This only makes `cashSafe` *more conservative* (smaller), which is the safe direction, and never affects the headline `limitSafe`. Accepted for v1; do not add dedup complexity unless it proves wrong in practice.

- [ ] **Step 4: Run to verify all pass**

Run: `npx jest safe-to-spend`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts __tests__/safe-to-spend.test.ts
git commit -m "feat: getSafeToSpend query (discretionary limit + cash backstop)"
```

---

## Task 3: Buffer setting — server action

**Files:**
- Modify: `app/actions.ts` (mirror the existing allowance action near line 64)

- [ ] **Step 1: Read the existing allowance action**

Run: `sed -n '55,75p' app/actions.ts` to copy its exact shape (auth/`'use server'`/revalidate pattern).

- [ ] **Step 2: Add a `setBuffer` server action**

Mirror the allowance action exactly, persisting key `safe_to_spend_buffer`. Clamp negatives to 0:

```ts
export async function setBuffer(amount: number) {
  // ...same auth guard + db import pattern as setAllowance...
  await upsertSetting(db, 'safe_to_spend_buffer', String(Math.max(0, Math.round(amount))))
  // ...same revalidatePath calls as the allowance action...
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/actions.ts
git commit -m "feat: setBuffer server action for safe-to-spend buffer setting"
```

---

## Task 4: `BufferEditor` component

**Files:**
- Create: `components/BufferEditor.tsx` (copy `components/AllowanceEditor.tsx`, swap action + labels)

- [ ] **Step 1: Read `components/AllowanceEditor.tsx`** to copy its exact structure/styles.

- [ ] **Step 2: Create `BufferEditor.tsx`**

Same component, prop `buffer: number`, calls `setBuffer` instead of the allowance action, label "Safety buffer". Keep markup/classes identical to `AllowanceEditor` for visual consistency.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/BufferEditor.tsx
git commit -m "feat: BufferEditor component"
```

---

## Task 5: `SafeToSpendCard` component

**Files:**
- Create: `components/SafeToSpendCard.tsx`
- Reference: `components/ProgressBar.tsx`, `components/StatCard.tsx`, `lib/format.ts` (`formatCAD`)

- [ ] **Step 1: Read `ProgressBar.tsx` and the current allowance card markup**

Run: `sed -n '110,140p' app/page.tsx` and `cat components/ProgressBar.tsx` to match existing card styling/tokens.

- [ ] **Step 2: Create `SafeToSpendCard.tsx`**

Server component (no client state needed except the breakdown toggle → make it a small client component with `'use client'` and a `useState` for expand, OR use a native `<details>` for zero JS). Prefer `<details>/<summary>` to keep it a server component. Props: the `SafeToSpend` object. Render per the spec's UI section:
- Heading "SAFE TO SPEND", `formatCAD(safeToSpend)` large. If `safeToSpend < 0`, render `formatCAD(safeToSpend)` in `var(--negative)` with "over" wording.
- Subtext "discretionary, left this month".
- `ProgressBar` for `discretionarySpent / monthlyLimit` (guard divide-by-zero).
- Secondary line: "Bills still due this month {formatCAD(billsStillDue)}".
- `<details>` breakdown: Monthly limit / − Discretionary spent / = Safe to spend. When `backstopBinding`, also show Spendable cash / − Credit owed / − Bills still due / − Buffer / = Cash limit, and a note "Limited by available cash".

Match Tailwind tokens used elsewhere (`var(--ink)`, `var(--muted-text)`, `var(--negative)`, `var(--positive)`, card classes from `Card.tsx`).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add components/SafeToSpendCard.tsx
git commit -m "feat: SafeToSpendCard component"
```

---

## Task 6: Wire into the dashboard

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the allowance card**

In `app/page.tsx`: import `getSafeToSpend` and `SafeToSpendCard`; call `const safe = await getSafeToSpend(db, /* current year/month */)` (use the same current-month derivation the page already uses — check how `getMonthlySpend()` is called with no args and mirror that default, or pass the current year/month). Replace the JSX block that renders the allowance/remaining card (around lines 125-135) with `<SafeToSpendCard {...safe} />`. Remove now-unused `allowance`/`remaining`/`spendRatio` locals if nothing else uses them (grep first).

- [ ] **Step 2: Verify no dangling references**

Run: `grep -n "allowance\|spendRatio\|remaining" app/page.tsx`
Expected: no unused references remain (or only ones still used elsewhere on the page).

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: success.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open http://localhost:3000, confirm the card shows a number, progress bar, bills line, and the breakdown expands. (See @skills/verify or @skills/run if available.)

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: show SafeToSpendCard on dashboard"
```

---

## Task 7: Spending page — discretionary basis + buffer editor + relabel

**Files:**
- Modify: `app/spending/page.tsx`
- Modify: `components/AllowanceEditor.tsx` (copy/label only)

- [ ] **Step 1: Switch spending page to discretionary figures**

In `app/spending/page.tsx`: call `getSafeToSpend(db, year, month)` and drive the existing allowance bar from `discretionarySpent` vs `monthlyLimit` (replace the `allowance - spend` / `spendRatio` locals at lines ~46-57). Recompute the existing projected-spend logic on `discretionarySpent` instead of raw `spend`. Render `BufferEditor` alongside the existing `AllowanceEditor`.

- [ ] **Step 2: Relabel the limit in `AllowanceEditor.tsx`**

Change user-facing copy from "allowance" to "Monthly spending limit (discretionary)". Do **not** rename the setting key or the component file — storage stays `allowance` (no migration).

- [ ] **Step 3: Grep for other "allowance" UI copy**

Run: `grep -rn "allowance" app/ components/ | grep -iv "getSetting\|upsertSetting\|safe_to_spend"`
Expected: update any remaining user-facing "allowance" label to the new wording; leave setting-key usages untouched.

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npx next build`
Expected: success.

- [ ] **Step 5: Manual visual check**

`npm run dev` → `/spending`: the bar reflects discretionary spend vs limit, buffer editor works, labels read "discretionary limit". Confirm the dashboard and spending numbers agree.

- [ ] **Step 6: Commit**

```bash
git add app/spending/page.tsx components/AllowanceEditor.tsx
git commit -m "feat: spending page on discretionary basis + buffer editor + relabel limit"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass (existing + new `safe-to-spend.test.ts`).

- [ ] **Step 2: Typecheck + production build**

Run: `npx tsc --noEmit && npx next build`
Expected: both succeed (matches CI in `.github/workflows/ci.yml`).

- [ ] **Step 3: Final manual smoke test**

`npm run dev`: dashboard card and spending page agree; breakdown expands; editing the limit and buffer updates the numbers; a month with unpaid bills shows them in "bills still due" without lowering the headline.

- [ ] **Step 4: Confirm with the user before merging** (do not merge/PR without explicit instruction — see project git conventions).

---

## Notes for the implementer

- **DRY:** `getSafeToSpend` must compose the existing queries listed above — do not re-query transactions ad hoc for sums that an existing function already provides.
- **No schema migration:** the only new persisted value is the `safe_to_spend_buffer` row in the existing `settings` table; no `drizzle-kit generate` needed.
- **Plaid amount convention:** `amount > 0` = spend/outflow, `< 0` = income/credit. Credit-account `balanceCurrent` is the positive amount owed.
- **Tests use `better-sqlite3`** (sync, in-memory) per `__tests__/db.test.ts`; query functions only rely on the shared runtime surface, hence the `as unknown as DB` cast.
