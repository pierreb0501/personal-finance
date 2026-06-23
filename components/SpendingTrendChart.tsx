'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { ChartTooltipCard } from '@/components/ChartTooltipCard'

type MonthData = {
  label: string
  breakdown: { category: string; total: number }[]
}

type Props = {
  months: MonthData[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s, p) => s + p.value, 0)
  return (
    <ChartTooltipCard className="min-w-[160px]">
      <p className="font-semibold text-[var(--ink)] mb-1">{label} — {formatCAD(total)}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
            <span className="text-[var(--muted-text)]">{getCategoryLabel(p.name)}</span>
          </div>
          <span className="tabular-nums text-[var(--ink)]">{formatCAD(p.value)}</span>
        </div>
      ))}
    </ChartTooltipCard>
  )
}

export function SpendingTrendChart({ months }: Props) {
  if (months.length < 2) {
    return (
      <p className="text-[12px] text-[var(--faint)] text-center py-8">
        Not enough history yet — check back next month
      </p>
    )
  }

  const categoryTotals = new Map<string, number>()
  for (const m of months) {
    for (const b of m.breakdown) {
      categoryTotals.set(b.category, (categoryTotals.get(b.category) ?? 0) + b.total)
    }
  }
  const allKeys = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)

  const data = months.map((m) => {
    const row: Record<string, string | number> = { label: m.label }
    for (const b of m.breakdown) {
      row[b.category] = ((row[b.category] as number) ?? 0) + b.total
    }
    return row
  })

  return (
    <div className="mt-4 -mx-1" style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--faint)' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f2ec', opacity: 0.8 }} />
          {allKeys.map((cat, i) => (
            <Bar
              key={cat}
              dataKey={cat}
              stackId="a"
              fill={getCategoryColor(cat)}
              radius={i === allKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
