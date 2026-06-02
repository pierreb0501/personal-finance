import { formatCAD } from '@/lib/format'
import { CategoryChip } from './CategoryChip'
import { IgnoreButton } from './IgnoreButton'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory?: string | null
  ignored?: number
}

type Props = {
  tx: Transaction
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

function merchantInitial(name: string | null, category: string): string {
  if (name) return name[0].toUpperCase()
  return category[0]?.toUpperCase() ?? '?'
}

export function TransactionRow({ tx, rules: _rules, knownCustomCategories }: Props) {
  const displayName = tx.merchantName ?? tx.category
  const initial = merchantInitial(tx.merchantName, tx.category)
  const ignored = Boolean(tx.ignored)

  return (
    <div
      className={[
        'flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0',
        ignored ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-[34px] h-[34px] rounded-[9px] bg-[#f0ede5] flex items-center justify-center text-[13px] font-bold text-[var(--muted-text)] shrink-0">
          {initial}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-[var(--ink)] truncate leading-tight">{displayName}</p>
            {ignored && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
                Ignored
              </span>
            )}
          </div>
          {!ignored && (
            <CategoryChip
              txId={tx.id}
              merchantName={tx.merchantName}
              category={tx.category}
              knownCustomCategories={knownCustomCategories}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 ml-4 shrink-0">
        <p className={['text-[14px] font-semibold tabular-nums', ignored ? 'line-through text-[var(--faint)]' : 'text-[var(--ink)]'].join(' ')}>
          -{formatCAD(tx.amount)}
        </p>
        <IgnoreButton txId={tx.id} ignored={ignored} />
      </div>
    </div>
  )
}
