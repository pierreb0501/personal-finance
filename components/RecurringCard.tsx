import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { Repeat2 } from 'lucide-react'

type RecurringMerchant = {
  merchantName: string
  category: string
  avgAmount: number
  monthCount: number
  dayOfMonth: number
}

type Props = {
  merchants: RecurringMerchant[]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

export function RecurringCard({ merchants }: Props) {
  if (merchants.length === 0) return null

  const monthlyTotal = merchants.reduce((s, m) => s + m.avgAmount, 0)

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Recurring charges
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            Same day each month (±2 days)
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Est. monthly</p>
          <p className="font-bold text-[20px] tabular-nums text-[var(--ink)] mt-0.5">{formatCAD(monthlyTotal)}</p>
        </div>
      </div>

      <div className="divide-y divide-[var(--hairline)]">
        {merchants.map((m) => (
          <div key={m.merchantName} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Repeat2 size={13} className="text-[var(--faint)] shrink-0" />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--ink)] truncate">{m.merchantName}</p>
                <p className="text-[12px]" style={{ color: getCategoryColor(m.category) }}>
                  {getCategoryLabel(m.category)}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">~{formatCAD(m.avgAmount)}</p>
              <p className="text-[11px] text-[var(--faint)]">~{ordinal(m.dayOfMonth)} of each month</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
