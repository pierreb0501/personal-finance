type Props = {
  className?: string
  children: React.ReactNode
}

export function ChartTooltipCard({ className, children }: Props) {
  return (
    <div
      className={[
        'bg-white border border-[var(--hairline)] rounded-[10px] px-3 py-2 text-[13px] shadow-md',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
