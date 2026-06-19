# Committed Items & Account Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Monthly Commitments" card showing user-defined expected income and fixed expenses with a received/paid status check, and display the source account on every transaction row.

**Architecture:** A new `committed_items` SQLite table stores user-defined income sources and fixed expenses. A query function joins them against the current month's transactions to compute a `confirmed` status per item. Account source is added by joining `transactions → accounts → items` in `getTransactionsForMonth`, passed as a new prop through `TransactionList → TransactionRow`, and rendered as a small grey badge.

**Tech Stack:** Drizzle ORM, SQLite, Next.js server components, React client components, server actions, Tailwind CSS (CSS vars pattern already in place).

---

## File Map

**New files:**
- `lib/db/migrations/0007_committed_items.sql` — DDL for the new table
- `components/CommittedCard.tsx` — client component: committed income + expenses card with add/remove UI

**Modified files:**
- `lib/db/schema.ts` — add `committedItems` table export
- `lib/db/queries.ts` — add 5 query functions for committed items; update `getTransactionsForMonth` to include account source
- `app/actions.ts` — 3 new server actions (add/update/delete committed item)
- `components/TransactionRow.tsx` — accept optional `accountLabel` prop, render source badge
- `components/TransactionList.tsx` — accept and thread `accountLabels` map to each row
- `app/spending/page.tsx` — fetch committed items + account labels, render `CommittedCard`, pass data down

---

## Task 1: DB migration — committed_items table

**Files:**
- Create: `lib/db/migrations/0007_committed_items.sql`
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Write the migration SQL**

```sql
-- lib/db/migrations/0007_committed_items.sql
CREATE TABLE `committed_items` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `expected_amount` real NOT NULL,
  `expected_day` integer,
  `merchant_name` text,
  `category` text NOT NULL,
  `created_at` integer NOT NULL
);
```

- [ ] **Step 2: Apply the migration**

```bash
sqlite3 finance.db < lib/db/migrations/0007_committed_items.sql
```

Expected: no output, exit 0.

- [ ] **Step 3: Add the Drizzle schema export**

In `lib/db/schema.ts`, add after the `dismissedRecurring` table:

```typescript
export const committedItems = sqliteTable('committed_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'income' | 'expense'
  expectedAmount: real('expected_amount').notNull(),
  expectedDay: integer('expected_day'),  // nullable
  merchantName: text('merchant_name'),   // nullable, used for matching
  category: text('category').notNull(),
  createdAt: integer('created_at').notNull(),
})
```

- [ ] **Step 4: Verify table exists**

```bash
sqlite3 finance.db ".schema committed_items"
```

Expected: prints the CREATE TABLE statement.

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations/0007_committed_items.sql lib/db/schema.ts
git commit -m "feat: add committed_items table for recurring income and fixed expenses"
```

---

## Task 2: Query functions for committed items

**Files:**
- Modify: `lib/db/queries.ts`

Add these 5 functions at the bottom of the file (before the last closing export if any, otherwise just append).

- [ ] **Step 1: Add CRUD functions**

Append to `lib/db/queries.ts`:

```typescript
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
```

- [ ] **Step 2: Add the status-check function**

This is the core query: for a given month, check which committed items have a matching confirmed transaction.

Append to `lib/db/queries.ts`:

```typescript
export type CommittedItemWithStatus = {
  id: string
  name: string
  type: 'income' | 'expense'
  expectedAmount: number
  expectedDay: number | null
  merchantName: string | null
  category: string
  confirmedAmount: number | null  // actual amount if confirmed, null if not yet
}

export function getCommittedItemsWithStatus(db: DB, year: number, month: number): CommittedItemWithStatus[] {
  const { start, end } = monthBounds(year, month)
  const items = getCommittedItems(db)

  // Fetch all non-pending transactions for the month
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
    // Direction: income transactions are credits (amount < 0 in Plaid convention)
    const isIncome = item.type === 'income'
    const candidates = txs.filter((tx) => {
      const rightDirection = isIncome ? tx.amount < 0 : tx.amount > 0
      if (!rightDirection) return false
      const absAmount = Math.abs(tx.amount)
      // Income: allow ±30% (salary varies slightly). Expenses: allow +35%/-30% (bills can overshoot slightly).
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
```

- [ ] **Step 3: Verify the import of `asc` is present at the top of queries.ts**

Check that line 1 of `lib/db/queries.ts` includes `asc` in the import:

```typescript
import { desc, eq, and, gte, sql, asc, lt } from 'drizzle-orm'
```

If `asc` is missing, add it. (`asc` is already imported per the current file.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/queries.ts
git commit -m "feat: add committed items query functions with monthly status check"
```

---

## Task 3: Server actions for committed items

**Files:**
- Modify: `app/actions.ts`

- [ ] **Step 1: Add imports and actions**

At the top of `app/actions.ts`, add to the destructured import from `@/lib/db/queries`:
```
addCommittedItem as dbAddCommittedItem,
deleteCommittedItem as dbDeleteCommittedItem,
```

Then append the new server actions at the bottom of `app/actions.ts`:

```typescript
export async function addCommittedIncomeItem(
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
): Promise<void> {
  dbAddCommittedItem(db, name, 'income', expectedAmount, category, expectedDay, merchantName)
  revalidatePath('/spending')
}

export async function addCommittedExpenseItem(
  name: string,
  expectedAmount: number,
  category: string,
  expectedDay?: number,
  merchantName?: string,
): Promise<void> {
  dbAddCommittedItem(db, name, 'expense', expectedAmount, category, expectedDay, merchantName)
  revalidatePath('/spending')
}

export async function deleteCommittedItem(id: string): Promise<void> {
  dbDeleteCommittedItem(db, id)
  revalidatePath('/spending')
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions.ts
git commit -m "feat: add server actions for committed income and expense items"
```

---

## Task 4: CommittedCard component

**Files:**
- Create: `components/CommittedCard.tsx`

This is a client component. It has two collapsible sections (Income / Fixed Expenses) with item rows showing expected vs confirmed amounts, a ✓/✗ status, and an add form for each section.

- [ ] **Step 1: Create the component**

```typescript
// components/CommittedCard.tsx
'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
import { Check, X, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import {
  addCommittedIncomeItem,
  addCommittedExpenseItem,
  deleteCommittedItem,
} from '@/app/actions'
import type { CommittedItemWithStatus } from '@/lib/db/queries'

type Props = {
  items: CommittedItemWithStatus[]
  knownCustomCategories: string[]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function StatusBadge({ confirmed, amount }: { confirmed: boolean; amount: number | null }) {
  if (confirmed && amount !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--positive)] bg-[#e8f4ed] px-1.5 py-0.5 rounded-full shrink-0">
        <Check size={9} />
        {formatCAD(amount)}
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
      Pending
    </span>
  )
}

function DeleteBtn({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  async function handle() {
    setPending(true)
    await deleteCommittedItem(id)
    setPending(false)
  }
  return (
    <button
      onClick={handle}
      disabled={pending}
      className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer"
    >
      <X size={13} />
    </button>
  )
}

function AddForm({
  type,
  knownCustomCategories,
  onDone,
}: {
  type: 'income' | 'expense'
  knownCustomCategories: string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [merchant, setMerchant] = useState('')
  const defaultCat = type === 'income' ? 'INCOME' : 'GENERAL_SERVICES'
  const [category, setCategory] = useState(defaultCat)
  const [pending, setPending] = useState(false)

  const allCategories = [
    ...Object.keys(CATEGORY_LABELS),
    ...knownCustomCategories.filter((c) => !CATEGORY_LABELS[c]),
  ]

  async function handle() {
    if (!name.trim() || !amount) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return
    const dayNum = day ? Math.min(31, Math.max(1, Number(day))) : undefined
    setPending(true)
    if (type === 'income') {
      await addCommittedIncomeItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    } else {
      await addCommittedExpenseItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    }
    setPending(false)
    onDone()
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--hairline)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">
        Add {type === 'income' ? 'income source' : 'fixed expense'}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label (e.g. Bell Internet)"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Expected amount (CAD)"
          min={0}
          step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          placeholder="Day of month (optional)"
          min={1}
          max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Merchant keyword (optional)"
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        >
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={pending || !name.trim() || !amount}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--ink)] text-white rounded-[8px] hover:opacity-80 disabled:opacity-40 transition-opacity cursor-pointer"
        >
          <Check size={12} />
          {pending ? 'Saving…' : 'Add'}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Section({
  type,
  items,
  knownCustomCategories,
}: {
  type: 'income' | 'expense'
  items: CommittedItemWithStatus[]
  knownCustomCategories: string[]
}) {
  const [showForm, setShowForm] = useState(false)
  const isIncome = type === 'income'
  const label = isIncome ? 'Income' : 'Fixed Expenses'
  const Icon = isIncome ? TrendingUp : TrendingDown
  const confirmed = items.filter((i) => i.confirmedAmount !== null)
  const total = items.reduce((s, i) => s + i.expectedAmount, 0)
  const confirmedTotal = confirmed.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className={isIncome ? 'text-[var(--positive)]' : 'text-[var(--negative)]'} />
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--muted-text)]">{label}</p>
          <span className="text-[11px] text-[var(--faint)]">
            {confirmed.length}/{items.length} confirmed
          </span>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <p className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">
              {confirmedTotal > 0
                ? <>{formatCAD(confirmedTotal)} <span className="text-[var(--faint)] font-normal">/ {formatCAD(total)}</span></>
                : formatCAD(total)
              }
            </p>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {items.length === 0 && !showForm && (
        <p className="text-[13px] text-[var(--faint)] pb-1">
          None added — click <Plus size={11} className="inline" /> to track {isIncome ? 'an income source' : 'a fixed expense'}.
        </p>
      )}

      <div className="divide-y divide-[var(--hairline)]">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: getCategoryColor(item.category) }}
              />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--ink)] truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[var(--faint)]" style={{ color: getCategoryColor(item.category) }}>
                    {getCategoryLabel(item.category)}
                  </span>
                  {item.expectedDay && (
                    <span className="text-[11px] text-[var(--faint)]">· {ordinal(item.expectedDay)}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <div className="text-right">
                <p className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">
                  {formatCAD(item.expectedAmount)}
                </p>
                <StatusBadge confirmed={item.confirmedAmount !== null} amount={item.confirmedAmount} />
              </div>
              <DeleteBtn id={item.id} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <AddForm
          type={type}
          knownCustomCategories={knownCustomCategories}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

export function CommittedCard({ items, knownCustomCategories }: Props) {
  const incomeItems = items.filter((i) => i.type === 'income')
  const expenseItems = items.filter((i) => i.type === 'expense')

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
      <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-5">
        Monthly Commitments
      </h3>

      <Section type="income" items={incomeItems} knownCustomCategories={knownCustomCategories} />

      <div className="my-5 border-t border-[var(--hairline)]" />

      <Section type="expense" items={expenseItems} knownCustomCategories={knownCustomCategories} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/CommittedCard.tsx
git commit -m "feat: add CommittedCard component for monthly income and expense commitments"
```

---

## Task 5: Add account source to transactions

**Files:**
- Modify: `lib/db/queries.ts` — update `getTransactionsForMonth`
- Modify: `components/TransactionRow.tsx` — add `accountLabel` prop + source badge
- Modify: `components/TransactionList.tsx` — add `accountLabels` map prop, thread down

### 5a: Update the query

- [ ] **Step 1: Add account join to `getTransactionsForMonth`**

In `lib/db/queries.ts`, update `getTransactionsForMonth` to join accounts and items:

Replace the existing `getTransactionsForMonth` function body with:

```typescript
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
```

- [ ] **Step 2: Add `shortAccountLabel` utility**

Add this helper function near the top of `lib/db/queries.ts`, after the imports (before the `localDateString` function):

```typescript
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
```

### 5b: Update TransactionRow

- [ ] **Step 3: Add `accountLabel` prop to TransactionRow**

In `components/TransactionRow.tsx`:

1. Add `accountLabel?: string` to the `Transaction` type:
```typescript
type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory?: string | null
  ignored?: number
  accountLabel?: string   // ← add this
}
```

2. After the `isRecurring` badge (around line 73), add the account source badge:
```typescript
{tx.accountLabel && (
  <span className="text-[10px] font-medium text-[var(--faint)] bg-[#f5f4f2] border border-[var(--hairline)] px-1.5 py-0.5 rounded-full shrink-0">
    {tx.accountLabel}
  </span>
)}
```

### 5c: Update TransactionList

- [ ] **Step 4: Thread accountLabel through TransactionList**

`TransactionList` passes transactions directly to `TransactionRow`. Since `accountLabel` is now part of each transaction object returned by the query, it will flow through automatically — no prop changes needed in `TransactionList`. Confirm that `TransactionRow` receives `tx` as a spread object and `accountLabel` will be present on it.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries.ts components/TransactionRow.tsx
git commit -m "feat: add account source label to transaction rows"
```

---

## Task 6: Wire up on spending page

**Files:**
- Modify: `app/spending/page.tsx`

- [ ] **Step 1: Import and fetch committed items**

Add the import for `CommittedCard`:
```typescript
import { CommittedCard } from '@/components/CommittedCard'
```

Add the import for `getCommittedItemsWithStatus` to the existing destructured import from `@/lib/db/queries`.

In the server component body (after the `const recurringMerchants = ...` line), add:
```typescript
const committedItems = getCommittedItemsWithStatus(db, year, month)
```

- [ ] **Step 2: Render the CommittedCard**

Place `<CommittedCard>` above `<RecurringCard>` (at the bottom of the page, after the transactions table):

```tsx
{/* Monthly Commitments */}
<CommittedCard items={committedItems} knownCustomCategories={knownCustomCategories} />

{/* Recurring charges */}
<RecurringCard merchants={recurringMerchants} knownCustomCategories={knownCustomCategories} />
```

- [ ] **Step 3: Verify the TypeScript build compiles**

```bash
cd /Users/pierreb/dev/personal-finance && npx tsc --noEmit 2>&1 | head -30
```

Expected: no output (zero errors). If there are errors, fix them before committing.

- [ ] **Step 4: Commit**

```bash
git add app/spending/page.tsx
git commit -m "feat: wire CommittedCard into spending page"
```

---

## Task 7: Smoke test in browser

The dev server is already running on port 3001.

- [ ] **Step 1: Navigate to the spending page**

Open `http://localhost:3001/spending` and verify:
1. Transaction rows show account badges (e.g., "TD Chequing", "Amex")
2. The "Monthly Commitments" card appears below the transactions
3. The card shows two sections: Income and Fixed Expenses, each empty with an add button

- [ ] **Step 2: Add a test income item**

Click `+` in the Income section, fill in:
- Label: "CN Rail Salary"
- Amount: 1577.99
- Merchant keyword: CN
- Category: Income

Click Add. Verify the item appears and shows a green "Confirmed $1,577.99" badge (since CN pay was received this month).

- [ ] **Step 3: Add a test expense item**

Click `+` in Fixed Expenses, fill in:
- Label: "Rent"
- Amount: 2150
- Merchant keyword: Envoi
- Category: Rent

Click Add. Verify it shows confirmed (Envoi $2,150 was paid this month).

- [ ] **Step 4: Test with a not-yet-confirmed item**

Add an expense: "Bell Internet", $90.83, merchant keyword "Bell", category "Rent & Utilities" (`RENT_AND_UTILITIES` in the dropdown). Since no Bell transaction exists in June yet, it should show the "Pending" badge.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify committed items and account source features"
```
