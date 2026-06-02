import Link from 'next/link'
import { db } from '@/lib/db'
import { getLastSyncedAt } from '@/lib/db/queries'

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts * 1000
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function SyncStatus() {
  const lastSync = getLastSyncedAt(db)
  const now = Math.floor(Date.now() / 1000)

  if (!lastSync) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--faint)]">
        <span className="w-2 h-2 rounded-full bg-[var(--faint)]" />
        No sync yet
      </div>
    )
  }

  const diffMins = (now - lastSync) / 60

  if (diffMins > 24 * 60) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[var(--negative)]">
        <span className="w-2 h-2 rounded-full bg-[var(--negative)]" />
        <Link href="/connect" className="hover:underline">
          Reconnect
        </Link>
      </div>
    )
  }

  if (diffMins > 30) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-[#C8923B]">
        <span className="w-2 h-2 rounded-full bg-[#C8923B]" />
        Synced {formatRelative(lastSync)}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 text-[12px] text-[var(--positive)]">
      <span className="w-2 h-2 rounded-full bg-[var(--positive)]" />
      Synced {formatRelative(lastSync)}
    </div>
  )
}
