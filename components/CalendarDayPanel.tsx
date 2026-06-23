'use client'

import { useEffect } from 'react'
import { X, CalendarClock } from 'lucide-react'
import { TransactionRow } from '@/components/TransactionRow'
import { EmptyState } from '@/components/EmptyState'
import { formatCAD } from '@/lib/format'
import { getCategoryLabel } from '@/lib/categories'
import type { CalendarDay } from '@/lib/db/queries'
import type { CategoryRule } from '@/lib/categories'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatLongDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

type Props = {
  date: string
  day: CalendarDay | undefined
  rules: CategoryRule[]
  knownCustomCategories: string[]
  onClose: () => void
}

export function CalendarDayPanel({ date, day, rules, knownCustomCategories, onClose }: Props) {
  const actual = day?.actual ?? []
  const expected = day?.expected ?? []
  const netTotal = day?.netTotal ?? 0
  const hasContent = actual.length > 0 || expected.length > 0

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <div
        className="fixed z-50 bg-white border-[var(--hairline)] shadow-xl flex flex-col
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-[20px] border-t
          md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:top-0 md:h-full md:w-[420px] md:max-h-none md:rounded-t-none md:rounded-l-[20px] md:border-t-0 md:border-l"
      >
        <div className="flex items-start justify-between p-5 border-b border-[var(--hairline)]">
          <div>
            <p className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              {formatLongDate(date)}
            </p>
            {actual.length > 0 && (
              <p className={[
                'text-[14px] font-semibold tabular-nums mt-0.5',
                netTotal >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
              ].join(' ')}>
                {netTotal >= 0 ? '+' : '-'}{formatCAD(Math.abs(netTotal))} net
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex-1">
          {!hasContent && (
            <EmptyState
              icon={CalendarClock}
              message="No transactions or upcoming items"
              subMessage="This day is quiet"
            />
          )}

          {actual.length > 0 && (
            <div className="mb-5">
              {actual.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  rules={rules}
                  knownCustomCategories={knownCustomCategories}
                />
              ))}
            </div>
          )}

          {expected.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2.5">
                Expected
              </p>
              <div className="space-y-2">
                {expected.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] border border-dashed border-[#E8A23D] bg-[#FDF6E9]"
                  >
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-semibold text-[var(--ink)] truncate">{item.name}</p>
                      <p className="text-[11px] text-[var(--muted-text)]">{getCategoryLabel(item.category)}</p>
                    </div>
                    <span className="text-[13.5px] font-semibold tabular-nums text-[#B8761F] shrink-0">
                      {item.type === 'income' ? '+' : '-'}{formatCAD(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
