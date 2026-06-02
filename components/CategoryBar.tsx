import { getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'

type Props = {
  category: string
  amount: number
  share: number // 0–1
  color: string
}

export function CategoryBar({ category, amount, share, color }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1">
        <span className="flex items-center gap-2 text-[var(--ink)]">
          <span
            className="w-[9px] h-[9px] rounded-[3px] shrink-0"
            style={{ backgroundColor: color }}
          />
          {getCategoryLabel(category)}
        </span>
        <span className="font-semibold tabular-nums text-[var(--ink)]">{formatCAD(amount)}</span>
      </div>
      <div className="h-[6px] bg-[#eee9df] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(share * 100, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
