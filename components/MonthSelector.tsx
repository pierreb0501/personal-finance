'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  year: number
  month: number
  basePath?: string
  allowFuture?: boolean
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function MonthSelector({ year, month, basePath = '/spending', allowFuture = false }: Props) {
  const router = useRouter()
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  function navigate(offset: number) {
    let m = month + offset
    let y = year
    if (m > 12) { m = 1; y++ }
    if (m < 1) { m = 12; y-- }
    router.push(`${basePath}?year=${y}&month=${m}`)
  }

  return (
    <div className="inline-flex items-center gap-1 bg-[#f0ede5] rounded-[10px] p-[3px]">
      <button
        onClick={() => navigate(-1)}
        className="p-[5px] rounded-[7px] hover:bg-white transition-colors text-[var(--muted-text)] hover:text-[var(--ink)] cursor-pointer"
      >
        <ChevronLeft size={15} />
      </button>
      <span className="text-[12.5px] font-semibold text-[var(--ink)] px-2 tabular-nums min-w-[80px] text-center">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <button
        onClick={() => navigate(1)}
        disabled={!allowFuture && isCurrentMonth}
        className="p-[5px] rounded-[7px] hover:bg-white transition-colors text-[var(--muted-text)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
