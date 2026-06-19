import { db } from '@/lib/db'
import {
  getCommittedItemsWithStatus,
  getRecurringMerchantsWithStatus,
  getMerchantRules,
  getCustomCategories,
} from '@/lib/db/queries'
import { MonthSelector } from '@/components/MonthSelector'
import { RecurringChecklist } from '@/components/RecurringChecklist'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { year: yearStr, month: monthStr } = await searchParams
  const now = new Date()
  const year = yearStr ? Number(yearStr) : now.getFullYear()
  const month = monthStr ? Number(monthStr) : now.getMonth() + 1

  const committedItems = getCommittedItemsWithStatus(db, year, month)
  const recurringMerchants = getRecurringMerchantsWithStatus(db, year, month)
  const rules = getMerchantRules(db)
  const customCats = getCustomCategories(db)
  const knownCustomCategories = [...new Set([
    ...rules.map((r) => r.category),
    ...customCats.map((c) => c.name),
  ])]

  const incomeItems = committedItems.filter((i) => i.type === 'income')
  const expenseItems = committedItems.filter((i) => i.type === 'expense')

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            Recurring
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">
            {MONTH_NAMES[month - 1]} {year}
          </p>
        </div>
        <MonthSelector year={year} month={month} />
      </div>

      <RecurringChecklist
        incomeItems={incomeItems}
        expenseItems={expenseItems}
        chargeItems={recurringMerchants}
        knownCustomCategories={knownCustomCategories}
      />
    </div>
  )
}
