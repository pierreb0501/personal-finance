import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'

type Props = {
  icon?: LucideIcon
  message: string
  subMessage?: string
}

export function EmptyState({ icon: Icon = Inbox, message, subMessage }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
      <Icon size={32} className="text-[var(--faint)]" strokeWidth={1.4} />
      <p className="text-[14px] text-[var(--muted-text)]">{message}</p>
      {subMessage && <p className="text-[12px] text-[var(--faint)]">{subMessage}</p>}
    </div>
  )
}
