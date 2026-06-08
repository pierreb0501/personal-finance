import { formatCAD } from '@/lib/format'
import { CategoryChip } from './CategoryChip'
import { IgnoreButton } from './IgnoreButton'
import { Repeat2 } from 'lucide-react'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory?: string | null
  ignored?: number
  accountLabel?: string
}

type Props = {
  tx: Transaction
  rules: CategoryRule[]
  knownCustomCategories: string[]
  isRecurring?: boolean
}

function merchantInitial(name: string | null, category: string): string {
  if (name) return name[0].toUpperCase()
  return category[0]?.toUpperCase() ?? '?'
}

export function TransactionRow({ tx, rules: _rules, knownCustomCategories, isRecurring }: Props) {
  const displayName = tx.merchantName ?? tx.category
  const initial = merchantInitial(tx.merchantName, tx.category)
  const ignored = Boolean(tx.ignored)
  const isCredit = tx.amount < 0

  return (
    <div
      className={[
        'flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0',
        ignored ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={[
          'w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[13px] font-bold shrink-0',
          isCredit ? 'bg-[#e8f4ed] text-[var(--positive)]' : 'bg-[#f0ede5] text-[var(--muted-text)]',
        ].join(' ')}>
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--ink)] truncate leading-tight">{displayName}</p>
            {isCredit && !ignored && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--positive)] bg-[#e8f4ed] px-1.5 py-0.5 rounded-full shrink-0">
                Received
              </span>
            )}
            {ignored && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
                Ignored
              </span>
            )}
            {isRecurring && !ignored && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-text)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
                <Repeat2 size={9} />
                Recurring
              </span>
            )}
            {tx.accountLabel && (
              <span className="text-[10px] font-medium text-[var(--faint)] bg-[#f5f4f2] border border-[var(--hairline)] px-1.5 py-0.5 rounded-full shrink-0">
                {tx.accountLabel}
              </span>
            )}
          </div>
          {!ignored && (
            <CategoryChip
              txId={tx.id}
              merchantName={tx.merchantName}
              category={tx.category}
              isCredit={isCredit}
              knownCustomCategories={knownCustomCategories}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 ml-4 shrink-0">
        <p className={[
          'text-[14px] font-semibold tabular-nums',
          ignored ? 'line-through text-[var(--faint)]' : isCredit ? 'text-[var(--positive)]' : 'text-[var(--ink)]',
        ].join(' ')}>
          {isCredit ? '+' : '-'}{formatCAD(Math.abs(tx.amount))}
        </p>
        <IgnoreButton txId={tx.id} ignored={ignored} />
      </div>
    </div>
  )
}
