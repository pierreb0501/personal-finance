import { getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'

type Props = {
  category: string
  amount: number
  share: number   // 0–1, relative to max category spend (for bar width)
  color: string
  limit?: number  // monthly budget limit, if set
}

export function CategoryBar({ category, amount, share, color, limit }: Props) {
  const overBudget = limit !== undefined && limit > 0 && amount > limit

  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1.5">
        <span className="flex items-center gap-2 text-[var(--ink)]">
          <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
          {getCategoryLabel(category)}
        </span>
        <div className="flex items-center gap-2 tabular-nums">
          <span className={['font-semibold', overBudget ? 'text-[var(--negative)]' : 'text-[var(--ink)]'].join(' ')}>
            {formatCAD(amount)}
          </span>
          {limit !== undefined && (
            <span className="text-[12px] text-[var(--faint)]">/ {formatCAD(limit)}</span>
          )}
        </div>
      </div>
      <div className="h-[6px] bg-[#eee9df] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: amount <= 0 ? '0%' : `${Math.min((limit !== undefined && limit > 0 ? amount / limit : share) * 100, 100)}%`,
            backgroundColor: overBudget ? 'var(--negative)' : color,
          }}
        />
      </div>
    </div>
  )
}
