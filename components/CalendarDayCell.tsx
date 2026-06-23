'use client'

import { getHeatmapStyle } from '@/lib/calendar'
import { formatCAD } from '@/lib/format'
import { getCategoryColor } from '@/lib/categories'
import type { CalendarDay } from '@/lib/db/queries'

type Props = {
  date: string
  day: CalendarDay | undefined
  maxAbsNetTotal: number
  isToday: boolean
  isSelected: boolean
  onSelect: (date: string) => void
}

export function CalendarDayCell({ date, day, maxAbsNetTotal, isToday, isSelected, onSelect }: Props) {
  const dayNumber = Number(date.slice(-2))
  const hasActual = (day?.actual.length ?? 0) > 0
  const hasExpectedOnly = !hasActual && (day?.expected.length ?? 0) > 0
  const netTotal = day?.netTotal ?? 0

  const style = hasActual ? getHeatmapStyle(netTotal, maxAbsNetTotal) : getHeatmapStyle(0, maxAbsNetTotal)

  return (
    <button
      onClick={() => onSelect(date)}
      className={[
        'relative aspect-square rounded-[10px] border p-1.5 flex flex-col items-start justify-between text-left transition-shadow cursor-pointer',
        isSelected ? 'border-[var(--ink)] ring-2 ring-[var(--ink)] ring-opacity-20' : 'border-[var(--hairline)]',
        isToday ? 'border-dashed' : '',
      ].join(' ')}
      style={{ background: style.background }}
    >
      <span
        className="text-[11px] font-semibold"
        style={{ color: hasActual ? style.textColor : 'var(--faint)' }}
      >
        {dayNumber}
      </span>

      {hasActual && (
        <span
          className="text-[12px] sm:text-[13px] font-bold tabular-nums self-center"
          style={{ color: style.textColor }}
        >
          {netTotal >= 0 ? '+' : '-'}{formatCAD(Math.abs(netTotal))}
        </span>
      )}

      {hasExpectedOnly && (
        <span className="absolute top-1.5 right-1.5 flex gap-[3px]">
          {[...new Set(day!.expected.map((e) => getCategoryColor(e.category)))].map((color) => (
            <span
              key={color}
              className="w-[7px] h-[7px] rounded-full flex-shrink-0"
              style={{ background: color }}
            />
          ))}
        </span>
      )}
    </button>
  )
}
