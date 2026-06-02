export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={[
        'animate-pulse bg-[#ede9e0] rounded-[18px]',
        className,
      ].join(' ')}
    />
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={['bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow', className].join(' ')}>
      <div className="h-3 w-24 bg-[#ede9e0] rounded animate-pulse mb-4" />
      <div className="h-9 w-36 bg-[#ede9e0] rounded animate-pulse mb-3" />
      <div className="h-3 w-48 bg-[#ede9e0] rounded animate-pulse" />
    </div>
  )
}
