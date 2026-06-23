import { db } from '@/lib/db'
import { getCalendarMonth, getKnownCategories } from '@/lib/db/queries'
import { MonthSelector } from '@/components/MonthSelector'
import { CalendarGrid } from '@/components/CalendarGrid'
import { parseMonthParams } from '@/lib/month'
import { Card } from '@/components/Card'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year, month } = parseMonthParams(await searchParams)

  const calendar = await getCalendarMonth(db, year, month)
  const { rules, knownCustomCategories } = await getKnownCategories(db)

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Calendar
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} basePath="/calendar" allowFuture />
      </div>

      <div className="flex items-center gap-4 mb-5 text-[12px] text-[var(--muted-text)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--positive)]" /> Net gain day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--negative)]" /> Net loss day
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex gap-[3px]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          </span>
          Upcoming expected items (by category)
        </span>
      </div>

      <Card>
        <CalendarGrid
          year={year}
          month={month}
          calendar={calendar}
          rules={rules}
          knownCustomCategories={knownCustomCategories}
        />
      </Card>
    </div>
  )
}
