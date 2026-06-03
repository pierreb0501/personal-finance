import { db } from '@/lib/db'
import {
  getMonthlySpend,
  getCategoryBreakdown,
  getTransactionsForMonth,
  getMerchantRules,
  getSetting,
  getCategoryBudgets,
} from '@/lib/db/queries'
import { getCategoryColor } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { MonthSelector } from '@/components/MonthSelector'
import { AllowanceEditor } from '@/components/AllowanceEditor'
import { ProgressBar } from '@/components/ProgressBar'
import { DonutChart } from '@/components/DonutChart'
import { CategoryBar } from '@/components/CategoryBar'
import { TransactionRow } from '@/components/TransactionRow'
import { EmptyState } from '@/components/EmptyState'
import { Receipt } from 'lucide-react'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const now = new Date()
  const year = yearStr ? Number(yearStr) : now.getFullYear()
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1

  const spend = getMonthlySpend(db, year, month)
  const allowance = Number(getSetting(db, 'allowance') ?? '3000')
  const categories = getCategoryBreakdown(db, year, month)
  const transactions = getTransactionsForMonth(db, year, month)
  const rules = getMerchantRules(db)
  const budgets = getCategoryBudgets(db, year, month)
  const budgetMap = new Map(budgets.map((b) => [b.category, b.planned]))

  const remaining = allowance - spend
  const spendRatio = allowance > 0 ? spend / allowance : 0

  const donutSegments = categories.map((c, i) => ({
    label: c.category,
    value: c.total,
    color: getCategoryColor(c.category),
  }))

  const maxCategoryTotal = categories[0]?.total ?? 0

  const knownCustomCategories = [...new Set(rules.map((r) => r.category))]

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Spending
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-[18px] mb-[18px]">
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Spent</p>
          <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
            {formatCAD(spend)}
          </p>
        </div>

        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">Allowance</p>
          <AllowanceEditor allowance={allowance} />
        </div>

        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Remaining</p>
          <p
            className={[
              'font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2',
              remaining >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
            ].join(' ')}
          >
            {remaining >= 0 ? formatCAD(remaining) : `-${formatCAD(Math.abs(remaining))}`}
          </p>
        </div>
      </div>

      {/* Budget progress */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Budget used</p>
          <span className="font-bold tabular-nums text-[14px] text-[var(--ink)]">
            {Math.round(spendRatio * 100)}%
          </span>
        </div>
        <ProgressBar value={spendRatio} />
      </div>

      {/* Category breakdown */}
      {categories.length === 0 ? (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <EmptyState
            icon={Receipt}
            message="No transactions this month"
            subMessage="Sync your accounts or navigate to a different month"
          />
        </div>
      ) : (
        <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              By category
            </h3>
            <p className="text-[13px] text-[var(--muted-text)] mt-0.5 mb-4">This month</p>
            <DonutChart segments={donutSegments} />
          </div>

          <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
              Category breakdown
            </h3>
            <div className="space-y-4">
              {categories.map((cat) => (
                <CategoryBar
                  key={cat.category}
                  category={cat.category}
                  amount={cat.total}
                  share={maxCategoryTotal > 0 ? cat.total / maxCategoryTotal : 0}
                  color={getCategoryColor(cat.category)}
                  limit={budgetMap.get(cat.category)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transactions table */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-2">
            Transactions
          </h3>
          <div>
            {transactions.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                rules={rules}
                knownCustomCategories={knownCustomCategories}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
