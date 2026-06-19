import { db } from '@/lib/db'
import { getCategoryBreakdown, getCategoryBudgets, getMerchantRules, getCustomCategories, seedBudgetFromPrevious } from '@/lib/db/queries'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
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

  // Auto-seed from previous month on first visit
  let budgets = await getCategoryBudgets(db, year, month)
  if (budgets.length === 0) {
    await seedBudgetFromPrevious(db, year, month)
    budgets = await getCategoryBudgets(db, year, month)
  }

  const breakdown = await getCategoryBreakdown(db, year, month)
  const rules = await getMerchantRules(db)
  const customCats = await getCustomCategories(db)

  const plannedMap = new Map(budgets.map((b) => [b.category, b.planned]))
  const spendMap = new Map(breakdown.map((c) => [c.category, c.total]))

  // All categories that have either a plan or spending this month
  const allCategories = [...new Set([
    ...budgets.map((b) => b.category),
    ...breakdown.map((c) => c.category),
  ])].sort((a, b) => {
    // Over-plan first, then by spend descending
    const aSpent = spendMap.get(a) ?? 0
    const bSpent = spendMap.get(b) ?? 0
    const aPlan = plannedMap.get(a)
    const bPlan = plannedMap.get(b)
    const aOver = aPlan ? aSpent > aPlan : false
    const bOver = bPlan ? bSpent > bPlan : false
    if (aOver && !bOver) return -1
    if (bOver && !aOver) return 1
    return bSpent - aSpent
  })

  const totalPlanned = budgets.reduce((s, b) => s + b.planned, 0)
  const totalSpent = allCategories.reduce((s, c) => s + (spendMap.get(c) ?? 0), 0)

  // Categories not yet planned this month
  const knownCustomCategories = [
    ...new Set([
      ...rules.map((r) => r.category),
      ...customCats.map((c) => c.name),
    ])
  ]
  const allKnown = [...new Set([...Object.keys(CATEGORY_LABELS), ...knownCustomCategories])]
  const unplannedCategories = allKnown.filter((c) => !plannedMap.has(c))

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[900px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Budget Planner
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            Plan your spending for {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} basePath="/budget" />
      </div>

      {/* Summary cards */}
      {totalPlanned > 0 && (
        <div className="grid grid-cols-3 gap-[18px] mb-[18px]">
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Planned</p>
            <p className="font-bold text-[26px] tracking-tight tabular-nums mt-1.5 text-[var(--ink)]">{formatCAD(totalPlanned)}</p>
          </div>
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Spent</p>
            <p className="font-bold text-[26px] tracking-tight tabular-nums mt-1.5 text-[var(--ink)]">{formatCAD(totalSpent)}</p>
          </div>
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-5 card-shadow card-rise">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
              {totalPlanned - totalSpent >= 0 ? 'Remaining' : 'Over plan'}
            </p>
            <p className={[
              'font-bold text-[26px] tracking-tight tabular-nums mt-1.5',
              (totalPlanned - totalSpent) < 0 ? 'text-[var(--negative)]' : 'text-[var(--positive)]',
            ].join(' ')}>
              {formatCAD(Math.abs(totalPlanned - totalSpent))}
            </p>
          </div>
        </div>
      )}

      {/* Category plan list */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] px-6 card-shadow card-rise mb-[18px]">
        <div className="flex items-center justify-between py-5 border-b border-[var(--hairline)]">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            {MONTH_NAMES[month - 1]} plan
          </h3>
          <p className="text-[12px] text-[var(--faint)]">Click any amount to edit · actual vs planned</p>
        </div>

        {allCategories.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[14px] text-[var(--muted-text)]">No plan set for this month</p>
            <p className="text-[12px] text-[var(--faint)] mt-1">Add categories below to start planning</p>
          </div>
        ) : (
          allCategories.map((category) => (
            <BudgetRow
              key={category}
              category={category}
              spent={spendMap.get(category) ?? 0}
              planned={plannedMap.get(category) ?? null}
              year={year}
              month={month}
            />
          ))
        )}
      </div>

      {/* Add category to plan */}
      {unplannedCategories.length > 0 && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
            Add to plan
          </h3>
          <AddCategoryBudget categories={unplannedCategories} year={year} month={month} />
        </div>
      )}
    </div>
  )
}
