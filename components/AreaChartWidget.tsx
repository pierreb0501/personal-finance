'use client'

import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCAD } from '@/lib/format'

type DataPoint = { date: string; value: number }

type Props = {
  data: DataPoint[]
  color: string
  gradientId: string
  height?: number
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-[var(--hairline)] rounded-[10px] px-3 py-2 text-[13px] shadow-md">
      <p className="font-semibold tabular-nums text-[var(--ink)]">{formatCAD(payload[0].value)}</p>
    </div>
  )
}

export function AreaChartWidget({ data, color, gradientId, height = 150 }: Props) {
  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center mt-4" style={{ height }}>
        <p className="text-[12px] text-[var(--faint)] text-center">
          History building — check back as data accumulates
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 -mx-1" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: color, strokeWidth: 1, strokeOpacity: 0.3 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
