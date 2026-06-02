import { TrendingUp, TrendingDown } from 'lucide-react'

type Props = {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  valueClassName?: string
  className?: string
  children?: React.ReactNode
}

export function StatCard({ label, value, delta, deltaPositive, valueClassName, className, children }: Props) {
  return (
    <div
      className={[
        'bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise',
        className,
      ].join(' ')}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
        {label}
      </p>
      <p className={['font-bold text-[30px] tracking-tight tabular-nums mt-2 leading-none', valueClassName].join(' ')}>
        {value}
      </p>
      {delta !== undefined && (
        <span
          className={[
            'inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full mt-2',
            deltaPositive
              ? 'bg-[#e6f1ea] text-[var(--positive)]'
              : 'bg-[#f6e8e4] text-[var(--negative)]',
          ].join(' ')}
        >
          {deltaPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {delta}
        </span>
      )}
      {children}
    </div>
  )
}
