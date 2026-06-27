import { Card } from '@/components/Card'
import { ProgressBar } from '@/components/ProgressBar'
import { formatCAD } from '@/lib/format'
import type { SafeToSpend } from '@/lib/db/queries'

type Props = {
  data: SafeToSpend
}

export function SafeToSpendCard({ data }: Props) {
  const {
    monthlyLimit,
    discretionarySpent,
    billsStillDue,
    spendableCash,
    creditOwed,
    buffer,
    cashSafe,
    safeToSpend,
    backstopBinding,
  } = data

  const isOver = safeToSpend < 0
  const progressRatio = monthlyLimit > 0 ? discretionarySpent / monthlyLimit : 0

  return (
    <Card>
      {/* Label */}
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
        Safe to Spend
      </p>

      {/* Hero number */}
      <p
        className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2"
        style={{ color: isOver ? 'var(--negative)' : 'var(--ink)' }}
      >
        {isOver
          ? `${formatCAD(Math.abs(safeToSpend))} over`
          : formatCAD(safeToSpend)}
      </p>
      <p className="text-[13px] text-[var(--muted-text)] mt-1">
        discretionary, left this month
      </p>

      {/* Usage gauge */}
      <ProgressBar value={progressRatio} className="mt-3.5" />

      {/* Bills still due — always shown */}
      <div className="flex justify-between items-center text-[13px] mt-3">
        <span className="text-[var(--muted-text)]">Bills still due this month</span>
        <span className="font-semibold tabular-nums text-[var(--ink)]">
          {formatCAD(billsStillDue)}
        </span>
      </div>

      {/* Expandable breakdown */}
      <details className="mt-3 group">
        <summary className="cursor-pointer list-none text-[12px] font-semibold text-[var(--muted-text)] select-none flex items-center gap-1">
          <span className="group-open:rotate-90 inline-block transition-transform duration-200">▸</span>
          breakdown
        </summary>

        <div className="mt-2 space-y-1 text-[13px]">
          {/* Limit math */}
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted-text)]">Monthly limit</span>
            <span className="tabular-nums text-[var(--ink)]">{formatCAD(monthlyLimit)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted-text)]">− Discretionary spent</span>
            <span className="tabular-nums text-[var(--ink)]">−{formatCAD(discretionarySpent)}</span>
          </div>
          <div className="flex justify-between items-center font-semibold border-t border-[var(--hairline)] pt-1 mt-1">
            <span className="text-[var(--ink)]">= Safe to spend</span>
            <span
              className="tabular-nums"
              style={{ color: isOver ? 'var(--negative)' : 'var(--ink)' }}
            >
              {formatCAD(safeToSpend)}
            </span>
          </div>

          {/* Cash backstop section — only when binding */}
          {backstopBinding && (
            <>
              <div className="border-t border-[var(--hairline)] mt-3 pt-2 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-text)]">Spendable cash</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCAD(spendableCash)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-text)]">− Credit owed</span>
                  <span className="tabular-nums text-[var(--ink)]">−{formatCAD(creditOwed)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-text)]">− Bills still due</span>
                  <span className="tabular-nums text-[var(--ink)]">−{formatCAD(billsStillDue)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted-text)]">− Buffer</span>
                  <span className="tabular-nums text-[var(--ink)]">−{formatCAD(buffer)}</span>
                </div>
                <div className="flex justify-between items-center font-semibold border-t border-[var(--hairline)] pt-1">
                  <span className="text-[var(--ink)]">= Cash limit</span>
                  <span className="tabular-nums text-[var(--ink)]">{formatCAD(cashSafe)}</span>
                </div>
              </div>
              <p className="text-[11px] text-[var(--muted-text)] mt-1 italic">
                Limited by available cash.
              </p>
            </>
          )}
        </div>
      </details>
    </Card>
  )
}
