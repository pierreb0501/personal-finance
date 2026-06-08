import { db } from '@/lib/db'
import {
  getMonthlySpend,
  getCategoryBreakdown,
  getTransactionsForMonth,
  getMerchantRules,
  getSetting,
  getCategoryBudgets,
  getCustomCategories,
  getCategoryTrendMonths,
  getRecurringMerchants,
  getCommittedItemsWithStatus,
} from '@/lib/db/queries'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { MonthSelector } from '@/components/MonthSelector'
import { AllowanceEditor } from '@/components/AllowanceEditor'
import { IncomeEditor } from '@/components/IncomeEditor'
import { ProgressBar } from '@/components/ProgressBar'
import { DonutChart } from '@/components/DonutChart'
import { CategoryBar } from '@/components/CategoryBar'
import { TransactionList } from '@/components/TransactionList'
import { EmptyState } from '@/components/EmptyState'
import { TransferAlert } from '@/components/TransferAlert'
import { SpendingTrendChart } from '@/components/SpendingTrendChart'
import { RecurringCard } from '@/components/RecurringCard'
import { CommittedCard } from '@/components/CommittedCard'
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
  const income = Number(getSetting(db, 'income') ?? '0')
  const categories = getCategoryBreakdown(db, year, month)
  const transactions = getTransactionsForMonth(db, year, month)
  const rules = getMerchantRules(db)
  const budgets = getCategoryBudgets(db, year, month)
  const budgetMap = new Map(budgets.map((b) => [b.category, b.planned]))

  const remaining = allowance - spend
  const spendRatio = allowance > 0 ? spend / allowance : 0
  const savings = income > 0 ? income - spend : null
  const savingsRate = income > 0 ? ((income - spend) / income) * 100 : null

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  const projectedSpend = isCurrentMonth && dayOfMonth > 0
    ? (spend / dayOfMonth) * daysInMonth
    : null
  const projectedRemaining = projectedSpend !== null ? allowance - projectedSpend : null
  const projectedSavings = projectedSpend !== null && income > 0 ? income - projectedSpend : null
  const projectedSavingsRate = projectedSavings !== null && income > 0
    ? (projectedSavings / income) * 100
    : null

  // Exclude negative-total categories (credits/refunds) — a negative dashLen breaks SVG rendering
  const donutSegments = categories
    .filter((c) => c.total > 0)
    .map((c) => ({
      label: getCategoryLabel(c.category),
      value: c.total,
      color: getCategoryColor(c.category),
    }))

  const maxCategoryTotal = categories[0]?.total ?? 0

  const trendMonths = getCategoryTrendMonths(db, 6)
  const recurringMerchants = getRecurringMerchants(db)
  const committedItems = getCommittedItemsWithStatus(db, year, month)
  const customCats = getCustomCategories(db)
  const knownCustomCategories = [...new Set([
    ...rules.map((r) => r.category),
    ...customCats.map((c) => c.name),
  ])]

  // Unlabeled transfers: category is still TRANSFER_IN or TRANSFER_OUT (meaning no customCategory applied)
  const unlabeledTransfers = transactions.filter(
    (tx) => (tx.category === 'TRANSFER_IN' || tx.category === 'TRANSFER_OUT') && !tx.ignored
  )

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
      <div className="grid grid-cols-4 gap-[18px] mb-[18px]">
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Spent</p>
          <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
            {formatCAD(spend)}
          </p>
        </div>

        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">Income</p>
          <IncomeEditor income={income} />
        </div>

        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">Allowance</p>
          <AllowanceEditor allowance={allowance} />
        </div>

        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          {savings !== null ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Saved</p>
              <p
                className={[
                  'font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2',
                  savings >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
                ].join(' ')}
              >
                {savings >= 0 ? formatCAD(savings) : `-${formatCAD(Math.abs(savings))}`}
              </p>
              {savingsRate !== null && (
                <p className="text-[12px] text-[var(--muted-text)] mt-1">
                  {savingsRate >= 0 ? '+' : ''}{savingsRate.toFixed(1)}% savings rate
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Remaining</p>
              <p
                className={[
                  'font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2',
                  remaining >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
                ].join(' ')}
              >
                {remaining >= 0 ? formatCAD(remaining) : `-${formatCAD(Math.abs(remaining))}`}
              </p>
            </>
          )}
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

      {/* Month-end predictor */}
      {projectedSpend !== null && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Month-end forecast</p>
              <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
                {formatCAD(projectedSpend)}
              </p>
              <p className="text-[13px] text-[var(--muted-text)] mt-1">
                projected by end of month · day {dayOfMonth}/{daysInMonth}
              </p>
            </div>
            <div className="text-right">
              {projectedRemaining !== null && (
                <div className={[
                  'inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 py-1 rounded-full',
                  projectedRemaining >= 0 ? 'bg-[#e6f1ea] text-[var(--positive)]' : 'bg-[#f6e8e4] text-[var(--negative)]',
                ].join(' ')}>
                  {projectedRemaining >= 0 ? '▲' : '▼'}{' '}
                  {projectedRemaining >= 0
                    ? `${formatCAD(projectedRemaining)} under`
                    : `${formatCAD(Math.abs(projectedRemaining))} over`}
                </div>
              )}
              {projectedSavingsRate !== null && (
                <p className="text-[12px] text-[var(--muted-text)] mt-1.5">
                  {projectedSavingsRate >= 0 ? '+' : ''}{projectedSavingsRate.toFixed(1)}% projected savings rate
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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

      {/* 6-month trend */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
          Spending trend
        </h3>
        <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Last 6 months by category</p>
        <SpendingTrendChart months={trendMonths} />
      </div>

      {/* Unlabeled transfers alert */}
      <TransferAlert
        transfers={unlabeledTransfers}
        rules={rules}
        knownCustomCategories={knownCustomCategories}
      />

      {/* Transactions table */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
            Transactions
          </h3>
          <TransactionList
            transactions={transactions}
            rules={rules}
            knownCustomCategories={knownCustomCategories}
            recurringMerchantNames={new Set(recurringMerchants.map((m) => m.merchantName))}
          />
        </div>
      )}

      {/* Monthly Commitments */}
      <CommittedCard items={committedItems} knownCustomCategories={knownCustomCategories} />

      {/* Recurring charges — below transactions */}
      <RecurringCard merchants={recurringMerchants} knownCustomCategories={knownCustomCategories} />
    </div>
  )
}
