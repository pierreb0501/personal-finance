---
name: dashboard-ui-rebuild
description: Full UI rebuild — warm light theme, sidebar nav, 4 routes, interactive category rules, editable allowance, Recharts area/donut charts
metadata:
  type: project
---

# Personal Finance Dashboard — UI Rebuild Design Spec

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** Presentation layer only + 2 new schema tables. The existing data-sync layer (Plaid, sync logic, core schema) is untouched.

---

## 1. Visual Direction

"Calm private-bank minimalism." Warm off-white canvas, deep evergreen accent, generous whitespace, large confident numbers, restrained color. Matches `finance-ui-mockup.html` exactly — that file is the pixel-level source of truth.

**Light mode only.** The `dark` class is removed from `<html>` in `layout.tsx`. The `.dark {}` block in `globals.css` is deleted entirely. No dark-mode variant is provided.

### Design Tokens

All tokens defined as CSS variables in `globals.css`. **The existing shadcn variable names are remapped to the warm palette — not removed.** Tabs, Table, Skeleton, Popover, and other shadcn components stay themed automatically because they reference these same variable names.

```css
:root {
  /* Canvas & surfaces */
  --background:      #F5F2EC;   /* warm canvas */
  --card:            #FFFFFF;   /* card surface */
  --popover:         #FFFFFF;
  --secondary:       #FCFBF8;   /* warm surface (sidebar bg) */

  /* Text */
  --foreground:      #1C1B19;
  --card-foreground: #1C1B19;
  --popover-foreground: #1C1B19;
  --secondary-foreground: #1C1B19;
  --muted-foreground: #6E6A62;
  --accent-foreground: #1C1B19;
  --primary-foreground: #FFFFFF;

  /* Structural */
  --border:          #E8E4DB;
  --input:           #E8E4DB;
  --ring:            #1E4B3A;
  --muted:           #F0EDE5;

  /* Accent & semantic */
  --primary:         #1E4B3A;   /* evergreen — buttons, active nav */
  --accent:          #2E7D5B;   /* softer green — fills, chart stroke */
  --destructive:     #B5503C;   /* clay negative */

  /* Radius + shadow */
  --radius:          18px;

  /* Semantic aliases (used in component classes) */
  --canvas:          #F5F2EC;
  --surface:         #FFFFFF;
  --surface-warm:    #FCFBF8;
  --ink:             #1C1B19;
  --muted-text:      #6E6A62;
  --faint:           #A8A39A;
  --hairline:        #E8E4DB;
  --accent-dark:     #1E4B3A;
  --accent-soft:     #2E7D5B;
  --positive:        #2E7D5B;
  --negative:        #B5503C;
  --shadow:          0 1px 2px rgba(28,27,25,.04), 0 6px 24px -12px rgba(28,27,25,.10);
}
```

**Tailwind theme** maps these variables so component classes can use `bg-canvas`, `text-ink`, `text-muted`, `border-hairline`, `text-positive`, `text-negative`, `bg-accent`, etc.

**Radius:** cards 18px (`rounded-[18px]`), controls 10–12px (`rounded-[10px]`).  
**Spacing:** 8px base grid; card padding 24px; gap between cards 18px.  
**Numbers:** `font-variant-numeric: tabular-nums` applied globally via `body` style; all figure elements also get `tabular-nums` class.

### Typography

| Role | Font | Weight / Size |
|---|---|---|
| Page titles, section headings, wordmark | Fraunces (serif) | 300–500, 19–30px |
| Body, labels, all figures | Hanken Grotesk | 400–700 |
| Hero numbers | Hanken Grotesk | 700, 44px |
| Uppercase section labels | Hanken Grotesk | 600, 11–12px, letter-spacing .1em |

Loaded via `next/font/google`. **Geist fonts removed entirely** — removed from `layout.tsx` imports and from the `--font-sans` / `--font-mono` variable assignments.

### Category Color Palette

The 8-color palette used for all category visualization:

```ts
export const PALETTE = [
  '#2E7D5B',  // c1 — evergreen
  '#C8923B',  // c2 — amber
  '#B5503C',  // c3 — clay
  '#4A6B8A',  // c4 — slate blue
  '#7A5A78',  // c5 — plum
  '#8AA17E',  // c6 — sage
  '#C9A66B',  // c7 — sand
  '#4E8C86',  // c8 — teal
] as const
export const PALETTE_FALLBACK = '#A8A39A' // neutral gray for unknown
```

**Seeded Plaid → palette mapping** (in `lib/categories.ts`, fully replacing existing file):

| Plaid category key | Display label | Palette index |
|---|---|---|
| `FOOD_AND_DRINK` | Food & Drink | 0 (c1 #2E7D5B) |
| `GENERAL_MERCHANDISE` | Shopping | 6 (c7 #C9A66B) |
| `TRANSPORTATION` | Transport | 3 (c4 #4A6B8A) |
| `ENTERTAINMENT` | Entertainment | 4 (c5 #7A5A78) |
| `RENT_AND_UTILITIES` | Bills & Utilities | 7 (c8 #4E8C86) |
| `LOAN_PAYMENTS` | Loan Payments | 3 (c4 #4A6B8A) |
| `GENERAL_SERVICES` | Services | 5 (c6 #8AA17E) |
| `PERSONAL_CARE` | Personal Care | 1 (c2 #C8923B) |
| `MEDICAL` | Medical | 2 (c3 #B5503C) |
| `TRAVEL` | Travel | 3 (c4 #4A6B8A) |
| `TRANSFER_IN` | Transfer In | 5 (c6 #8AA17E) |
| `TRANSFER_OUT` | Transfer Out | 4 (c5 #7A5A78) |
| `INCOME` | Income | 5 (c6 #8AA17E) |
| `OTHER` | Other | fallback (#A8A39A) |

**Custom/free-typed categories:** color assigned by `hashCategoryColor(name: string): string`. Implementation: sum char codes, modulo 8, index into `PALETTE`. Unknown/null: `PALETTE_FALLBACK`.

**`lib/categories.ts` is a full rewrite** of the existing file (which has different colors and no hash/applyCategoryRules functions).

---

## 2. Routing & Layout

### Routes

Four top-level routes under the root layout. **No route groups** — the sidebar layout lives directly in `app/layout.tsx` so `revalidatePath('/')` and `revalidatePath('/spending')` hit the correct segment tree.

| Path | Page |
|---|---|
| `/` | Overview |
| `/net-worth` | Net Worth |
| `/spending` | Spending (month via `?year=&month=` search params, defaults to current) |
| `/investments` | Investments |

### Shared Layout (`app/layout.tsx`)

```tsx
<html lang="en" className={`${fraunces.variable} ${hankenGrotesk.variable} h-full antialiased`}>
  {/* No "dark" class */}
  <body className="flex min-h-screen bg-[var(--canvas)]">
    <Sidebar />
    <main className="flex-1 overflow-auto">
      {children}
    </main>
  </body>
</html>
```

### Sidebar Structure

```
Sidebar (Server Component — app/components/Sidebar.tsx)
  ├─ Brand mark: "P" mark + "Ledger" wordmark (Fraunces)
  ├─ NavLinks (CLIENT — usePathname for active highlight)
  │    ├─ Overview      /
  │    ├─ Net Worth     /net-worth
  │    ├─ Spending      /spending
  │    └─ Investments   /investments
  ├─ SyncStatus (Server Component — reads last sync time)
  └─ ProfileFoot: avatar + "Pierre E." + "Personal" (static)
```

**`NavLinks`** is the only client component in the sidebar. It receives the nav items as props from the server wrapper and uses `usePathname()` to apply the active style (`bg-accent text-white` on the matching item).

**`SyncStatus`** data source: reads `MAX(accounts.updatedAt)` from the `accounts` table via a new query `getLastSyncedAt(db): number | null`. Renders as:
- Green dot + "Synced X min ago" when last sync < 30 minutes old
- Amber dot + "Synced X hours ago" when 30 min–24 hours old
- Red dot + "Reconnect" link to `/connect` when > 24 hours old or null

**Mobile:** Sidebar fixed 248px on ≥ 768px. Below 768px, sidebar hidden and a bottom tab bar appears (4 icon-only tabs using the same nav items).

---

## 3. Schema Additions

Two new tables and one column addition via Drizzle migration.

### `category_rules`

```ts
export const categoryRules = sqliteTable('category_rules', {
  id: text('id').primaryKey(),
  merchantName: text('merchant_name').notNull().unique(),
  category: text('category').notNull(),
  createdAt: integer('created_at').notNull(),
})
```

### `settings`

```ts
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
```

Used for `allowance` (stored as string `"3000"`, parsed to number on read). Single global value (MVP limitation).

### `transactions.customCategory` (column addition)

```ts
// Added to existing transactions table definition:
customCategory: text('custom_category'),  // nullable override for transactions with no merchant
```

Allows per-transaction category overrides when `merchant_name` is null (so no merchant rule can be saved). Applied in `applyCategoryRules`: if `customCategory` is non-null, it takes precedence over both the merchant rule and Plaid's category.

---

## 4. Query Changes & Helpers

### `lib/categories.ts` (full rewrite)

Exports:
- `PALETTE: string[]` — the 8 hex values
- `PALETTE_FALLBACK: string` — `#A8A39A`
- `CATEGORY_LABELS: Record<string, string>` — Plaid key → display label
- `CATEGORY_COLORS: Record<string, string>` — Plaid key → hex color (from seeded map above)
- `hashCategoryColor(name: string): string` — custom category color
- `getCategoryColor(category: string): string` — returns seeded color if found, else `hashCategoryColor(category)`
- `getCategoryLabel(category: string): string` — returns seeded label if found, else title-cases the string
- `applyCategoryRules<T extends { merchantName: string | null; category: string }>(txns: T[], rules: CategoryRule[]): T[]`

**`applyCategoryRules` behavior (priority order):**
1. If `customCategory` is non-null → use `customCategory` (highest priority, per-transaction override)
2. Else if `merchantName` is non-null AND exists in the rules map → use rule's category
3. Else → keep Plaid's original `category`
- Builds `Map<string, string>` from rules (merchantName → category)
- Returns new array; does not mutate input.
- Input type: `T extends { merchantName: string | null; category: string; customCategory?: string | null }`

### Modified queries (in `lib/db/queries.ts`)

```ts
getMonthlySpend(db, year?: number, month?: number): number
// Defaults to current year/month when params omitted

getCategoryBreakdown(db, year?: number, month?: number): { category: string; total: number }[]
// Applies applyCategoryRules after fetching

getRecentTransactions(db, limit = 20): TransactionRow[]
// Applies applyCategoryRules after fetching
```

### New queries

```ts
getTransactionsForMonth(db, year: number, month: number): TransactionRow[]
// Full transaction list for spending page, applies applyCategoryRules

getAllSnapshotHistory(db): Snapshot[]
// SELECT * FROM snapshots ORDER BY date ASC — no date filter
// Used by Overview, Net Worth, Investments so client-side RangeToggle can filter
// the full dataset without a server round-trip. SQLite is local; fetching all rows is fast.

getAllAccounts(db): AccountRow[]
// All accounts with balance + type (for net worth accounts table)

getMerchantRules(db): CategoryRule[]
// All rows from category_rules table

getSetting(db, key: string): string | null
// Single key lookup from settings table

getLastSyncedAt(db): number | null
// SELECT MAX(updated_at) FROM accounts — unix timestamp or null

updateTransactionCategory(db, txId: string, category: string): void
// UPDATE transactions SET custom_category = category WHERE id = txId

upsertSetting(db, key: string, value: string): void
upsertCategoryRule(db, merchantName: string, category: string): void
deleteCategoryRule(db, id: string): void
```

**History fetch pattern:** All pages with a `RangeToggle` call `getAllSnapshotHistory(db)` and pass the full array to the page. `RangeToggle` is a client component that receives the full history as a prop and slices it to the last N days before passing to `AreaChart`. No server round-trip on range change.

### Server Actions (`app/actions.ts`)

```ts
'use server'

export async function saveCategoryRule(merchantName: string, category: string): Promise<void>
// upsertCategoryRule
// revalidatePath('/') — busts root layout + all children
// revalidatePath('/spending')

export async function saveTransactionCategory(txId: string, category: string): Promise<void>
// updates transactions.customCategory for txId
// revalidatePath('/')
// revalidatePath('/spending')

export async function deleteCategoryRule(id: string): Promise<void>
// deleteCategoryRule
// revalidatePath('/')
// revalidatePath('/spending')

export async function saveAllowance(amount: number): Promise<void>
// upsertSetting('allowance', String(amount))
// revalidatePath('/')
// revalidatePath('/spending')
```

Each action calls two separate `revalidatePath` calls — `revalidatePath('/')` (not `revalidatePath('/', '/spending')`). `revalidatePath` signature: `(path: string, type?: 'page' | 'layout')`. No route groups → `revalidatePath('/')` busts the root layout and all pages under it.

---

## 5. Component Inventory

### Primitives (`components/ui/` or `components/`)

| Component | Props | Notes |
|---|---|---|
| `StatCard` | `label, value, delta?, deltaPositive?, className?` | label uppercase tracked, value as formatted string, optional delta chip |
| `RangeToggle` | `options: string[], value: string, onChange: (v: string) => void` | Client component; segmented control styled to match mockup |
| `AreaChart` | `data: {date: string, value: number}[], color: string, gradientId: string` | Recharts `AreaChart` — no axes, no grid, no legend; soft gradient fill, 2.5px stroke |
| `DonutChart` | `segments: {label: string, value: number, color: string}[]` | Pure SVG thin ring (r=15.9, stroke-width=6 on 42×42 viewBox) + inline legend. No Recharts. |
| `CategoryBar` | `category: string, amount: number, share: number, color: string` | Colored swatch + name + amount + thin (6px) bar at `share * 100%` width |
| `ProgressBar` | `value: number` | 0–∞ ratio. Bar color: `--accent-soft` when ≤ 1, `--negative` when > 1 |
| `TransactionRow` | `tx: TransactionRow, rules: CategoryRule[]` | Merchant initial bubble + name + `CategoryChip` (editable) + signed amount |
| `AccountRow` | `account: AccountRow` | Institution initials bubble + name + balance (negative-colored for credit/loan types) |
| `HoldingRow` | `holding: HoldingRow, totalPortfolioValue: number` | Ticker bold + security name muted + value + computed weight % |
| `Skeleton` | `className?` | Shimmer via `animate-pulse`, matches card dimensions |
| `EmptyState` | `icon?: LucideIcon, message: string, subMessage?: string` | Centered icon + text, used inside card |

### Interactive Client Components

| Component | Behavior |
|---|---|
| `CategoryChip` | Displays colored swatch + category label. Click opens `CategoryPopover`. Receives `txId`, `merchantName`, `category`, `rules` as props |
| `CategoryPopover` | Popover with: list of all known categories (seeded 14 + any custom ones already in rules); free-type input to create new. **Save behavior depends on toggle:** when `merchantName` is non-null, shows "Apply to all [merchant]" toggle (default ON). Toggle ON → `saveCategoryRule(merchantName, category)` (merchant rule, applies to all past+future transactions from this merchant). Toggle OFF → `saveTransactionCategory(txId, category)` (sets `transactions.customCategory` for this row only). When `merchantName` is null, toggle is hidden and always saves via `saveTransactionCategory`. Known categories list sourced from `CATEGORY_LABELS` keys + distinct categories already in `category_rules` (passed as prop from server). |
| `AllowanceEditor` | Renders allowance as big number. Click → controlled `<input>` pre-filled with current value. Enter/blur → `saveAllowance` Server Action → optimistic UI update. |
| `MonthSelector` | Current month label + prev/next chevron buttons. Calls `router.push('/spending?year=Y&month=M')`. Disables "next" when at current month. |
| `NavLinks` | Receives `items: {label, href, icon}[]`. Uses `usePathname()` to determine active item. Active style: `bg-[var(--accent-dark)] text-white`. |

---

## 6. Page Specs

### Overview (`/`)

Data fetched server-side:
```ts
const latest = getLatestSnapshot(db)
const history = getAllSnapshotHistory(db)  // full history; RangeToggle slices client-side
const monthlySpend = getMonthlySpend(db)
const allowance = getSetting(db, 'allowance') ?? '3000'
const categories = getCategoryBreakdown(db)
const holdings = getAllHoldings(db)
const transactions = getRecentTransactions(db, 4)
const rules = getMerchantRules(db)
```

Layout:
```
Header row: Greeting ("Good morning/afternoon/evening, Pierre") + date + SyncPill
Grid 1.6fr / 1fr:
  ├─ NetWorthHeroCard: label, $NNN,NNN hero number, delta chip, RangeToggle, AreaChart
  └─ ThisMonthCard:
       Spent big number
       "of $X allowance" muted
       ProgressBar (spent / allowance)
       "X% used · $Y left" muted row
       ─── hairline divider ───
       "Investments" uppercase label
       investments value (from latest.investmentsValue)
       delta from last 2 snapshots
Grid 1fr / 1.6fr:
  ├─ AllocationDonutCard: DonutChart of (investments / cash / liabilities / other) by account type
  └─ RecentActivityCard: 4 TransactionRow with editable CategoryChip
```

**Greeting** computed server-side from `new Date()` hour: before 12 → "morning", 12–17 → "afternoon", 17+ → "evening".

**RangeToggle** on NetWorthHeroCard: client component that filters `history` array already passed as prop — no refetch. Options: 1M (30d), 3M (90d), 1Y (365d), All.

### Net Worth (`/net-worth`)

Data:
```ts
const latest = getLatestSnapshot(db)
const history = getSnapshotHistory(db, 365)
const accounts = getAllAccounts(db)
```

Layout:
```
Header: "Net Worth" + "Assets minus liabilities" + RangeToggle (top right)
Grid 1fr / 1fr / 1fr: StatCard×3 — Net Worth (+delta), Assets, Liabilities (negative color)
TrendCard: full-width AreaChart of history.netWorth, accent dark stroke (#1E4B3A)
AccountsCard: AccountRow list — assets first, then divider, then liabilities
```

**Delta on Net Worth StatCard:** `latest.netWorth - history[0]?.netWorth` over the selected range period.

### Spending (`/spending?year=&month=`)

**In Next.js 16, `searchParams` is a `Promise`.** The page component must be `async` and `await` it before reading params:

```ts
// app/spending/page.tsx
export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const year = yearStr ? Number(yearStr) : new Date().getFullYear()
  const month = monthStr ? Number(monthStr) : new Date().getMonth() + 1
  ...
}
```

Data:
```ts
const spend = getMonthlySpend(db, year, month)
const allowance = Number(getSetting(db, 'allowance') ?? '3000')
const categories = getCategoryBreakdown(db, year, month)
const transactions = getTransactionsForMonth(db, year, month)
const rules = getMerchantRules(db)
```

Layout:
```
Header: "Spending" + "Month YYYY" + MonthSelector (top right)
Grid 1fr / 1fr / 1fr:
  ├─ SpentCard: StatCard
  ├─ AllowanceCard: AllowanceEditor wrapped in card
  └─ RemainingCard: StatCard, value green when positive / red when negative
BudgetCard: "Budget used · X%" + ProgressBar
Grid 1fr / 1.4fr:
  ├─ CategoryDonutCard: DonutChart (category segments)
  └─ CategoryBreakdownCard: CategoryBar list ranked by spend
TransactionsSection: full transaction table for the month, each row has editable CategoryChip
```

### Investments (`/investments`)

Data:
```ts
const holdings = getAllHoldings(db)
const history = getSnapshotHistory(db, 365)  // uses investments_value field
const latest = getLatestSnapshot(db)
```

Layout:
```
Header: "Investments" + institution sub-label + RangeToggle
Grid 1.6fr / 1fr:
  ├─ PortfolioHeroCard:
  │    "Portfolio value" label
  │    latest.investmentsValue hero number
  │    delta chip (vs start of range)
  │    AreaChart of history.map(s => ({date: s.date, value: s.investmentsValue}))
  │    Color: c4 slate blue (#4A6B8A) — distinct from net worth accent
  └─ AllocationCard:
       DonutChart: each holding as a segment (name, institutionValue, color from PALETTE by index)
       External legend: ticker + weight %
HoldingsCard: HoldingRow table — ticker, security name, value, weight %
```

**AreaChart data source:** `snapshots.investments_value` field over time. **Not** per-holding history (no such data exists). Individual holding "today's %" is not shown — only total portfolio delta over the selected range.

**Total portfolio value** for weight computation: `holdings.reduce((sum, h) => sum + h.institutionValue, 0)`.

---

## 7. Empty & Sparse States

| State | Treatment |
|---|---|
| No snapshots | Hero card shows `EmptyState`: "Connect an account and sync to see your net worth" |
| Sparse history (< 3 points) | AreaChart renders available points; "History building" text label overlaid |
| No transactions this month | EmptyState in category donut + transactions section: "No transactions recorded for this month" |
| No holdings | Investments allocation omitted from Overview AllocationDonut (uses account-type buckets instead); Investments page shows EmptyState |
| Loading | `<Suspense>` wrapping each section with matching `<Skeleton>` fallback |
| Stale / failed sync | SyncStatus renders amber or red dot + "Reconnect" link to `/connect` (based on `getLastSyncedAt` threshold) |

---

## 8. Known Limitations (MVP — do not solve now)

1. **Exact-string merchant matching** — Plaid returns variants like "UBER EATS" vs "UBER TRIP". Each needs its own rule. Fuzzy matching deferred.
2. **Global allowance** — One value applies to all months. Per-month allowances deferred.

---

## 9. Build Order

1. **Tokens + fonts** — `globals.css` rewrite (remove dark block, remap shadcn vars to warm palette, add semantic aliases), `layout.tsx` font swap (Fraunces + Hanken Grotesk, remove Geist, remove `dark` class), Tailwind theme mapping
2. **Schema migration** — add `category_rules` and `settings` tables via Drizzle
3. **`lib/categories.ts` rewrite** — `PALETTE`, `PALETTE_FALLBACK`, `CATEGORY_LABELS`, `CATEGORY_COLORS`, `hashCategoryColor`, `getCategoryColor`, `getCategoryLabel`, `applyCategoryRules`
4. **Query updates** — month params on existing queries, `applyCategoryRules` applied in all consumers, new queries (`getTransactionsForMonth`, `getAllAccounts`, `getMerchantRules`, `getSetting`, `getLastSyncedAt`, `upsertSetting`, `upsertCategoryRule`, `deleteCategoryRule`)
5. **Server Actions** — `app/actions.ts` with `saveCategoryRule`, `deleteCategoryRule`, `saveAllowance`
6. **App shell** — `app/layout.tsx` with sidebar, `components/Sidebar.tsx` (Server) + `components/NavLinks.tsx` (Client), `components/SyncStatus.tsx` (Server), four empty page files
7. **Primitive components** — `StatCard`, `RangeToggle`, `AreaChart`, `DonutChart`, `CategoryBar`, `ProgressBar`, `TransactionRow`, `AccountRow`, `HoldingRow`, `Skeleton`, `EmptyState`
8. **Interactive components** — `CategoryChip` + `CategoryPopover`, `AllowanceEditor`, `MonthSelector`
9. **Overview page** — assemble all primitives with real data
10. **Spending page** — month selector, allowance editor, category breakdown
11. **Investments page** — portfolio hero, allocation, holdings table
12. **Net Worth page** — 3 stat cards, trend chart, accounts table
13. **Polish** — staggered card fade-up animation (`animation-delay` nth-child pattern from mockup), empty/sparse states, mobile sidebar → bottom tab bar
