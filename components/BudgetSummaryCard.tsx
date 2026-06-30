import Link from 'next/link'
import { Card } from '@/components/Card'
import { ProgressBar } from '@/components/ProgressBar'
import { formatCAD } from '@/lib/format'
import type { BudgetSummary } from '@/lib/db/queries'

type Props = {
  data: BudgetSummary
}

export function BudgetSummaryCard({ data }: Props) {
  const { totalBudget, spendBudget, totalSpent, flexibleRemaining, unbudgetedSpend } = data

  // Empty state: no budget set
  if (totalBudget === 0) {
    return (
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
          Budget
        </p>
        <p className="text-[14px] text-[var(--muted-text)] mt-3">
          No budget configured yet.
        </p>
        <Link
          href="/budget"
          className="inline-block mt-2 text-[13px] font-semibold text-[var(--ink)] hover:underline"
        >
          Set a budget →
        </Link>
      </Card>
    )
  }

  const isOver = flexibleRemaining < 0
  // Compare consumption spend against the consumption budget (bills + flexible);
  // savings is excluded from both so the bar isn't diluted by the savings plan.
  const progressRatio = spendBudget > 0 ? totalSpent / spendBudget : 0

  return (
    <Card>
      {/* Label */}
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
        This Month
      </p>

      {/* Hero number */}
      <p
        className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2"
        style={{ color: isOver ? 'var(--negative)' : 'var(--ink)' }}
      >
        {isOver
          ? `${formatCAD(Math.abs(flexibleRemaining))} over`
          : formatCAD(flexibleRemaining)}
      </p>
      <p className="text-[13px] text-[var(--muted-text)] mt-1">
        {isOver ? 'flexible budget' : 'free to spend this month'}
      </p>

      {/* Overall budget progress bar */}
      <ProgressBar value={progressRatio} className="mt-3.5" />
      <p className="text-[12px] text-[var(--muted-text)] mt-1.5 tabular-nums">
        {formatCAD(totalSpent)} of {formatCAD(spendBudget)} budget
      </p>

      {/* Unbudgeted spend note */}
      {unbudgetedSpend > 0 && (
        <p className="text-[12px] text-[var(--muted-text)] mt-2">
          Unbudgeted: {formatCAD(unbudgetedSpend)}
        </p>
      )}
    </Card>
  )
}
