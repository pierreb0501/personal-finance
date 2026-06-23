'use client'

import { useState } from 'react'
import { getCalendarGridCells } from '@/lib/calendar'
import { CalendarDayCell } from '@/components/CalendarDayCell'
import { CalendarDayPanel } from '@/components/CalendarDayPanel'
import type { CalendarMonth } from '@/lib/db/queries'
import type { CategoryRule } from '@/lib/categories'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  year: number
  month: number
  calendar: CalendarMonth
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

export function CalendarGrid({ year, month, calendar, rules, knownCustomCategories }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const cells = getCalendarGridCells(year, month)
  const dayMap = new Map(calendar.days.map((d) => [d.date, d]))
  const todayStr = (() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })()

  const selectedDay = selectedDate ? dayMap.get(selectedDate) : undefined

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)] py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((date, i) =>
          date ? (
            <CalendarDayCell
              key={date}
              date={date}
              day={dayMap.get(date)}
              maxAbsNetTotal={calendar.maxAbsNetTotal}
              isToday={date === todayStr}
              isSelected={date === selectedDate}
              onSelect={setSelectedDate}
            />
          ) : (
            <div key={`blank-${i}`} />
          )
        )}
      </div>

      {selectedDate && (
        <CalendarDayPanel
          date={selectedDate}
          day={selectedDay}
          rules={rules}
          knownCustomCategories={knownCustomCategories}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}
