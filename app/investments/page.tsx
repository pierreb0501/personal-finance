import { db } from '@/lib/db'
import { getAllHoldings, getAllSnapshotHistory, getLatestSnapshot, getInvestmentTransactions } from '@/lib/db/queries'
import { PALETTE } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { NetWorthHeroCard } from '@/components/NetWorthHeroCard'
import { DonutChart } from '@/components/DonutChart'
import { HoldingRow } from '@/components/HoldingRow'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/Card'
import { BarChart2 } from 'lucide-react'
import { InvestmentActivityTable } from '@/components/InvestmentActivityTable'

export const dynamic = 'force-dynamic'

export default async function InvestmentsPage() {
  const holdings = await getAllHoldings(db)
  const history = await getAllSnapshotHistory(db)
  const latest = await getLatestSnapshot(db)
  const invTransactions = await getInvestmentTransactions(db)

  const totalPortfolioValue = holdings.reduce((s, h) => s + h.institutionValue, 0)
  const totalCostBasis = holdings.reduce((s, h) => s + (h.costBasis ?? 0), 0)
  const totalGain = totalCostBasis > 0
    ? holdings.reduce((s, h) => s + (h.costBasis != null ? h.institutionValue - h.costBasis : 0), 0)
    : null
  const totalGainPct = totalGain !== null && totalCostBasis > 0
    ? (totalGain / totalCostBasis) * 100
    : null

  const allocationSegments = holdings.map((h, i) => ({
    label: h.tickerSymbol ?? h.securityName,
    value: h.institutionValue,
    color: PALETTE[i % PALETTE.length],
  }))

  // Map history for investments_value
  const investHistory = history.map((s) => ({
    ...s,
    netWorth: s.investmentsValue,
    investmentsValue: s.investmentsValue,
    totalAssets: s.totalAssets,
    totalLiabilities: s.totalLiabilities,
  }))

  const investLatest = latest
    ? { ...latest, netWorth: latest.investmentsValue }
    : null

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
          Investments
        </h1>
        <p className="text-[14px] text-[var(--muted-text)] mt-1">Portfolio overview</p>
      </div>

      {/* Hero + Allocation */}
      <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <NetWorthHeroCard
          latest={investLatest}
          history={investHistory}
          color="#4A6B8A"
          gradientId="invGrad"
          valueKey="netWorth"
          label="Portfolio value"
        />

        <Card>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
            Allocation
          </h3>
          {holdings.length === 0 ? (
            <EmptyState icon={BarChart2} message="No holdings found" subMessage="Connect an investment account to see allocation" />
          ) : (
            <DonutChart segments={allocationSegments} />
          )}
        </Card>
      </div>

      {/* Holdings table */}
      <Card>
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
          Holdings
        </h3>
        {holdings.length === 0 ? (
          <EmptyState
            icon={BarChart2}
            message="No holdings yet"
            subMessage="Sync an investment account to see your holdings here"
          />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Holding</th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Value</th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Gain / Loss</th>
                <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Weight</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <HoldingRow key={h.id} holding={h} totalPortfolioValue={totalPortfolioValue} />
              ))}
            </tbody>
          </table>
        )}
        {holdings.length > 0 && (
          <div className="flex justify-between pt-3 border-t border-[var(--hairline)] mt-1">
            <span className="text-[13px] font-semibold text-[var(--muted-text)]">Total</span>
            <div className="flex items-center gap-6">
              {totalGain !== null && (
                <span className={[
                  'text-[13px] font-semibold tabular-nums',
                  totalGain >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
                ].join(' ')}>
                  {totalGain >= 0 ? '+' : ''}{formatCAD(totalGain)}
                  {totalGainPct !== null && (
                    <span className="ml-1 opacity-75 font-normal">
                      ({totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(1)}%)
                    </span>
                  )}
                </span>
              )}
              <span className="text-[13px] font-bold tabular-nums text-[var(--ink)]">{formatCAD(totalPortfolioValue)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* Investment transaction history */}
      <Card className="mt-[18px]">
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
          Activity
        </h3>
        {invTransactions.length === 0 ? (
          <EmptyState
            icon={BarChart2}
            message="No activity yet"
            subMessage="Transaction history will appear here after your next sync"
          />
        ) : (
          <InvestmentActivityTable transactions={invTransactions} />
        )}
      </Card>
    </div>
  )
}
