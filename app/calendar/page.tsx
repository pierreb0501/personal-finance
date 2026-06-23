import { db } from '@/lib/db'
import { getCalendarMonth, getMerchantRules, getCustomCategories } from '@/lib/db/queries'
import { MonthSelector } from '@/components/MonthSelector'
import { CalendarGrid } from '@/components/CalendarGrid'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const now = new Date()
  const year = yearStr ? Number(yearStr) : now.getFullYear()
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1

  const calendar = await getCalendarMonth(db, year, month)
  const rules = await getMerchantRules(db)
  const customCats = await getCustomCategories(db)
  const knownCustomCategories = [...new Set([
    ...rules.map((r) => r.category),
    ...customCats.map((c) => c.name),
  ])]

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
          <span className="w-2.5 h-2.5 rounded-full bg-[#E8A23D]" /> Upcoming expected item
        </span>
      </div>

      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
        <CalendarGrid
          year={year}
          month={month}
          calendar={calendar}
          rules={rules}
          knownCustomCategories={knownCustomCategories}
        />
      </div>
    </div>
  )
}
