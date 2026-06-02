'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { RangeToggle } from './RangeToggle'
import { AreaChartWidget } from './AreaChartWidget'
import { formatCAD } from '@/lib/format'
import { EmptyState } from './EmptyState'

type Snapshot = {
  date: string
  netWorth: number
  investmentsValue: number
  totalAssets: number
  totalLiabilities: number
}

const RANGES = ['1M', '3M', '1Y', 'All'] as const
type Range = typeof RANGES[number]

function filterHistory(history: Snapshot[], range: Range): Snapshot[] {
  if (range === 'All') return history
  const days = range === '1M' ? 30 : range === '3M' ? 90 : 365
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return history.filter((s) => s.date >= cutoffStr)
}

type Props = {
  latest: Snapshot | null
  history: Snapshot[]
  color?: string
  gradientId?: string
  valueKey?: 'netWorth' | 'investmentsValue'
  label?: string
}

export function NetWorthHeroCard({
  latest,
  history,
  color = '#1E4B3A',
  gradientId = 'nwGrad',
  valueKey = 'netWorth',
  label = 'Net worth',
}: Props) {
  const [range, setRange] = useState<Range>('3M')

  if (!latest) {
    return (
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">{label}</p>
        <EmptyState message="Connect an account and sync to see your net worth" />
      </div>
    )
  }

  const filtered = filterHistory(history, range)
  const current = latest[valueKey]
  const prev = filtered[0]?.[valueKey] ?? null
  const delta = prev !== null ? current - prev : null
  const deltaPositive = delta === null || delta >= 0
  const deltaPct = delta !== null && prev !== 0 ? (delta / Math.abs(prev)) * 100 : null

  const chartData = filtered.map((s) => ({ date: s.date, value: s[valueKey] }))

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">{label}</p>
        <RangeToggle options={[...RANGES]} value={range} onChange={(v) => setRange(v as Range)} />
      </div>

      <p className="font-bold text-[44px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
        {formatCAD(current)}
      </p>

      {delta !== null && (
        <span
          className={[
            'inline-flex items-center gap-1 text-[13.5px] font-semibold px-2.5 py-1 rounded-full mt-2.5',
            deltaPositive ? 'bg-[#e6f1ea] text-[var(--positive)]' : 'bg-[#f6e8e4] text-[var(--negative)]',
          ].join(' ')}
        >
          {deltaPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {delta >= 0 ? '+' : ''}{formatCAD(delta)}
          {deltaPct !== null && (
            <span className="opacity-60 ml-0.5">· {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%</span>
          )}
          <span className="opacity-40 ml-0.5 text-[12px]">{range}</span>
        </span>
      )}

      <AreaChartWidget data={chartData} color={color} gradientId={gradientId} height={150} />
    </div>
  )
}
