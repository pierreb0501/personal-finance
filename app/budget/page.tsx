import { db } from '@/lib/db'
import { getCategoryBreakdown, getCategoryBudgets, getMerchantRules } from '@/lib/db/queries'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS, getAllKnownCategories } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { BudgetRow } from '@/components/BudgetRow'
import { AddCategoryBudget } from '@/components/AddCategoryBudget'
import { MonthSelector } from '@/components/MonthSelector'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const now = new Date()
  const year = yearStr ? Number(yearStr) : now.getFullYear()
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1

  const budgets = getCategoryBudgets(db)
  const breakdown = getCategoryBreakdown(db, year, month)
  const rules = getMerchantRules(db)

  const budgetMap = new Map(budgets.map((b) => [b.category, b.monthlyLimit]))
  const spendMap = new Map(breakdown.map((c) => [c.category, c.total]))

  // Build unified list: all categories that have either a budget or spending this month
  const allCategories = [...new Set([
    ...budgets.map((b) => b.category),
    ...breakdown.map((c) => c.category),
  ])]

  // Sort: over-budget first, then by spent desc
  allCategories.sort((a, b) => {
    const aSpent = spendMap.get(a) ?? 0
    const bSpent = spendMap.get(b) ?? 0
    const aLimit = budgetMap.get(a)
    const bLimit = budgetMap.get(b)
    const aOver = aLimit ? aSpent / aLimit : 0
    const bOver = bLimit ? bSpent / bLimit : 0
    if (aOver > 1 && bOver <= 1) return -1
    if (bOver > 1 && aOver <= 1) return 1
    return bSpent - aSpent
  })

  const totalBudgeted = budgets.reduce((s, b) => s + b.monthlyLimit, 0)
  const totalSpent = breakdown.reduce((s, c) => s + c.total, 0)

  // Categories not yet in the budget list, available to add
  const knownCustomCategories = [...new Set(rules.map((r) => r.category))]
  const allKnown = [...new Set([...Object.keys(CATEGORY_LABELS), ...knownCustomCategories])]
  const unbudgetedCategories = allKnown.filter((c) => !budgetMap.has(c))

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[900px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Budget
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            Monthly limits by category — {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} basePath="/budget" />
      </div>

      {/* Summary row */}
      {totalBudgeted > 0 && (
        <div className="grid grid-cols-3 gap-[18px] mb-[18px]">
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Budgeted</p>
            <p className="font-bold text-[26px] tracking-tight tabular-nums mt-1.5 text-[var(--ink)]">{formatCAD(totalBudgeted)}</p>
          </div>
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Spent</p>
            <p className="font-bold text-[26px] tracking-tight tabular-nums mt-1.5 text-[var(--ink)]">{formatCAD(totalSpent)}</p>
          </div>
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Remaining</p>
            <p className={['font-bold text-[26px] tracking-tight tabular-nums mt-1.5', (totalBudgeted - totalSpent) < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]'].join(' ')}>
              {formatCAD(Math.abs(totalBudgeted - totalSpent))}
              <span className="text-[14px] font-normal text-[var(--faint)] ml-1">
                {(totalBudgeted - totalSpent) < 0 ? 'over' : 'left'}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Category budget list */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] px-6 card-shadow card-rise mb-[18px]">
        <div className="flex items-center justify-between py-5 border-b border-[var(--hairline)]">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Category limits
          </h3>
          <p className="text-[12px] text-[var(--faint)]">Click any amount to edit</p>
        </div>

        {allCategories.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-[var(--muted-text)]">No categories yet</p>
            <p className="text-[12px] text-[var(--faint)] mt-1">Add a limit below to start tracking</p>
          </div>
        ) : (
          allCategories.map((category) => (
            <BudgetRow
              key={category}
              category={category}
              spent={spendMap.get(category) ?? 0}
              monthlyLimit={budgetMap.get(category) ?? null}
            />
          ))
        )}
      </div>

      {/* Add category budget */}
      {unbudgetedCategories.length > 0 && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
            Add a category limit
          </h3>
          <AddCategoryBudget categories={unbudgetedCategories} />
        </div>
      )}
    </div>
  )
}
