import Link from 'next/link'
import { db } from '@/lib/db'
import {
  getMonthlySpend,
  getTransactionsForMonth,
  getBudgetSummary,
  getKnownCategories,
  getCategoryTrendMonths,
  getCommittedItemsWithStatus,
  getSpendByAccount,
} from '@/lib/db/queries'
import { formatCAD } from '@/lib/format'
import { parseMonthParams } from '@/lib/month'
import { MonthSelector } from '@/components/MonthSelector'
import { ProgressBar } from '@/components/ProgressBar'
import { TransactionList } from '@/components/TransactionList'
import { TransferAlert } from '@/components/TransferAlert'
import { SpendingTrendChart } from '@/components/SpendingTrendChart'
import { Card } from '@/components/Card'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year, month } = parseMonthParams(await searchParams)
  const now = new Date()

  const spend = await getMonthlySpend(db, year, month)
  const summary = await getBudgetSummary(db, year, month)
  const spendByAccount = await getSpendByAccount(db, year, month)
  const transactions = await getTransactionsForMonth(db, year, month)
  const { rules, knownCustomCategories } = await getKnownCategories(db)
  const committedItems = await getCommittedItemsWithStatus(db, year, month)
  const incomeItems = committedItems.filter((i) => i.type === 'income')
  const incomeCategories = new Set(incomeItems.map((i) => i.category))
  const expectedIncome = incomeItems.reduce((s, i) => s + i.expectedAmount, 0)
  const confirmedIncome = incomeItems.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0)
  const income = expectedIncome

  // Budget progress (total budget vs total spent)
  const spendRatio = summary.totalBudget > 0 ? summary.totalSpent / summary.totalBudget : 0
  const budgetRemaining = summary.totalBudget - summary.totalSpent
  const spentPct = summary.totalBudget > 0
    ? Math.round((summary.totalSpent / summary.totalBudget) * 100)
    : null

  const savings = income > 0 ? income - spend : null
  const savingsRate = income > 0 ? ((income - spend) / income) * 100 : null

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(year, month, 0).getDate()
  // Project discretionary spend to month-end using elapsed-days formula
  const projectedSpend = isCurrentMonth && dayOfMonth > 0
    ? (summary.totalSpent / dayOfMonth) * daysInMonth
    : null
  const projectedRemaining = projectedSpend !== null ? summary.totalBudget - projectedSpend : null
  const projectedSavings = projectedSpend !== null && income > 0 ? income - projectedSpend : null
  const projectedSavingsRate = projectedSavings !== null && income > 0
    ? (projectedSavings / income) * 100
    : null

  const trendMonthsRaw = await getCategoryTrendMonths(db, 6)
  const trendMonths = trendMonthsRaw.map((m) => ({
    ...m,
    breakdown: m.breakdown.filter((b) => !incomeCategories.has(b.category)),
  }))
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
        <div className="flex items-center gap-3">
          <MonthSelector year={year} month={month} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-[18px] mb-[18px]">
        <Card padding="sm">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Spent</p>
          <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
            {formatCAD(spend)}
          </p>
          <p className="text-[12px] text-[var(--muted-text)] mt-1">
            {spentPct !== null ? `${spentPct}% of budget` : '— of budget'}
          </p>
        </Card>

        <Card padding="sm">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">Income</p>
          {income > 0 ? (
            <>
              <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none text-[var(--ink)]">
                {formatCAD(confirmedIncome > 0 ? confirmedIncome : income)}
              </p>
              {confirmedIncome > 0 && confirmedIncome < income ? (
                <p className="text-[12px] text-[var(--muted-text)] mt-1">of {formatCAD(income)} expected</p>
              ) : confirmedIncome === 0 ? (
                <p className="text-[12px] text-[var(--faint)] mt-1">expected · vs {formatCAD(spend)} spent</p>
              ) : (
                <p className="text-[12px] text-[var(--muted-text)] mt-1">vs {formatCAD(spend)} spent</p>
              )}
            </>
          ) : (
            <>
              <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none text-[var(--faint)]">—</p>
              <p className="text-[12px] text-[var(--faint)] mt-1">no income recorded</p>
            </>
          )}
        </Card>

        <Card padding="sm">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Total budget</p>
          {summary.totalBudget > 0 ? (
            <>
              <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
                {formatCAD(summary.totalBudget)}
              </p>
              <div className="mt-2 space-y-0.5">
                <p className="text-[12px] text-[var(--muted-text)]">Bills {formatCAD(summary.billsBudget)}</p>
                <p className="text-[12px] text-[var(--muted-text)]">Flexible {formatCAD(summary.flexibleBudget)}</p>
                {summary.savingsBudget > 0 && (
                  <p className="text-[12px] text-[var(--muted-text)]">Savings {formatCAD(summary.savingsBudget)}</p>
                )}
              </div>
              <Link
                href="/budget"
                className="text-[11px] text-[var(--faint)] hover:text-[var(--muted-text)] mt-2 inline-block"
              >
                Edit budget →
              </Link>
            </>
          ) : (
            <>
              <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--faint)]">—</p>
              <Link
                href="/budget"
                className="text-[12px] text-[var(--faint)] hover:text-[var(--muted-text)] mt-2 inline-block"
              >
                Set up budget →
              </Link>
            </>
          )}
        </Card>

        <Card padding="sm">
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
                  budgetRemaining >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
                ].join(' ')}
              >
                {budgetRemaining >= 0 ? formatCAD(budgetRemaining) : `-${formatCAD(Math.abs(budgetRemaining))}`}
              </p>
              <p className="text-[12px] text-[var(--faint)] mt-1">no income recorded</p>
            </>
          )}
        </Card>
      </div>

      {/* Budget progress */}
      <Card className="mb-[18px]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Budget used</p>
          <span className="font-bold tabular-nums text-[14px] text-[var(--ink)]">
            {Math.round(spendRatio * 100)}%
          </span>
        </div>
        <ProgressBar value={spendRatio} />
        {summary.totalBudget > 0 && (
          <p className={['text-[12px] mt-2', budgetRemaining >= 0 ? 'text-[var(--muted-text)]' : 'text-[var(--negative)]'].join(' ')}>
            {budgetRemaining >= 0
              ? `${formatCAD(budgetRemaining)} remaining`
              : `${formatCAD(Math.abs(budgetRemaining))} over budget`}
          </p>
        )}
      </Card>

      {/* Month-end predictor */}
      {projectedSpend !== null && (
        <Card className="mb-[18px]">
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
        </Card>
      )}

      {/* Spend by account */}
      {spendByAccount.length > 0 && (
        <Card className="mb-[18px]">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            By account
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5 mb-4">Where this month&apos;s spending happened</p>
          <div className="space-y-3">
            {spendByAccount.map((a) => {
              const share = spendByAccount[0].total > 0 ? a.total / spendByAccount[0].total : 0
              return (
                <div key={a.label}>
                  <div className="flex items-center justify-between text-[13px] mb-1">
                    <span className="font-medium text-[var(--ink)]">{a.label}</span>
                    <span className="font-semibold tabular-nums text-[var(--ink)]">{formatCAD(a.total)}</span>
                  </div>
                  <div className="h-[6px] rounded-full bg-[#f0ede5] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--ink)] opacity-70"
                      style={{ width: `${Math.max(share * 100, 2)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* 6-month trend */}
      <Card className="mb-[18px]">
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
          Spending trend
        </h3>
        <p className="text-[13px] text-[var(--muted-text)] mt-0.5">Last 6 months by category</p>
        <SpendingTrendChart months={trendMonths} />
      </Card>

      {/* Unlabeled transfers alert */}
      <TransferAlert
        transfers={unlabeledTransfers}
        rules={rules}
        knownCustomCategories={knownCustomCategories}
      />

      {/* Transactions table */}
      {transactions.length > 0 && (
        <Card>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
            Transactions
          </h3>
          <TransactionList
            transactions={transactions}
            rules={rules}
            knownCustomCategories={knownCustomCategories}
          />
        </Card>
      )}
    </div>
  )
}
