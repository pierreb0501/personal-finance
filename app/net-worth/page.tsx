import { db } from '@/lib/db'
import { getLatestSnapshot, getAllSnapshotHistory, getAllAccounts } from '@/lib/db/queries'
import { formatCAD } from '@/lib/format'
import { NetWorthHeroCard } from '@/components/NetWorthHeroCard'
import { StatCard } from '@/components/StatCard'
import { AccountRow } from '@/components/AccountRow'
import { EmptyState } from '@/components/EmptyState'
import { Landmark } from 'lucide-react'

export default function NetWorthPage() {
  const latest = getLatestSnapshot(db)
  const history = getAllSnapshotHistory(db)
  const accounts = getAllAccounts(db)

  const prev = history.length >= 2 ? history[0] : null
  const delta = latest && prev ? latest.netWorth - prev.netWorth : null
  const deltaPct = delta !== null && prev && prev.netWorth !== 0
    ? (delta / Math.abs(prev.netWorth)) * 100
    : null

  const assetAccounts = accounts.filter((a) => a.type !== 'credit' && a.type !== 'loan')
  const liabilityAccounts = accounts.filter((a) => a.type === 'credit' || a.type === 'loan')

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
          Net Worth
        </h1>
        <p className="text-[14px] text-[var(--muted-text)] mt-1">Assets minus liabilities</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-[18px] mb-[18px]">
        <StatCard
          label="Net worth"
          value={latest ? formatCAD(latest.netWorth) : '—'}
          delta={delta !== null ? `${delta >= 0 ? '+' : ''}${formatCAD(delta)}${deltaPct !== null ? ` · ${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%` : ''}` : undefined}
          deltaPositive={delta === null || delta >= 0}
        />
        <StatCard
          label="Assets"
          value={latest ? formatCAD(latest.totalAssets) : '—'}
        />
        <StatCard
          label="Liabilities"
          value={latest ? formatCAD(latest.totalLiabilities) : '—'}
          valueClassName="text-[var(--negative)]"
        />
      </div>

      {/* Trend chart */}
      <div className="mb-[18px]">
        <NetWorthHeroCard
          latest={latest}
          history={history}
          label="Trend"
          color="#1E4B3A"
          gradientId="nwTrendGrad"
          valueKey="netWorth"
        />
      </div>

      {/* Accounts */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-2">
          Accounts
        </h3>
        {accounts.length === 0 ? (
          <EmptyState icon={Landmark} message="No accounts connected" subMessage="Add an account to see your balance breakdown" />
        ) : (
          <>
            {assetAccounts.map((a) => <AccountRow key={a.id} account={a} />)}
            {liabilityAccounts.length > 0 && (
              <>
                <div className="flex items-center gap-3 my-3">
                  <hr className="flex-1 border-[var(--hairline)]" />
                  <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Liabilities</span>
                  <hr className="flex-1 border-[var(--hairline)]" />
                </div>
                {liabilityAccounts.map((a) => <AccountRow key={a.id} account={a} />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
