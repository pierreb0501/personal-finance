type Padding = 'none' | 'sm' | 'default' | 'lg' | 'x-only'

type Props = {
  padding?: Padding
  className?: string
  children: React.ReactNode
}

const PADDING: Record<Padding, string> = {
  none: '',
  sm: 'p-5',
  default: 'p-6',
  lg: 'p-7',
  'x-only': 'px-6',
}

export function Card({ padding = 'default', className, children }: Props) {
  return (
    <div
      className={[
        'bg-white rounded-[18px] border border-[var(--hairline)]',
        PADDING[padding],
        'card-shadow card-rise',
        className,
      ].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  )
}
