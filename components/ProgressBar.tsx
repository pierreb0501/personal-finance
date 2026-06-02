type Props = {
  value: number // 0–∞ ratio; 1.0 = 100%
  className?: string
}

export function ProgressBar({ value, className }: Props) {
  const pct = Math.min(value * 100, 100)
  const overBudget = value > 1
  return (
    <div className={['h-[9px] bg-[#eee9df] rounded-full overflow-hidden', className].join(' ')}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          backgroundColor: overBudget ? 'var(--negative)' : 'var(--accent-soft)',
        }}
      />
    </div>
  )
}
