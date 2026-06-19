'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [forceMsg, setForceMsg] = useState('')

  const doSync = async (force = false) => {
    setSyncing(true)
    setForceMsg(force ? 'Re-fetching all history…' : '')
    try {
      await fetch('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      router.refresh()
    } finally {
      setSyncing(false)
      setForceMsg('')
    }
  }

  return (
    <div className="flex items-center gap-2">
      {forceMsg && (
        <span className="text-[12px] text-[var(--muted-text)]">{forceMsg}</span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => doSync(true)}
        disabled={syncing}
        title="Reset cursors and re-fetch all transaction history from scratch"
        className="gap-1.5 cursor-pointer text-[var(--muted-text)]"
      >
        {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        Full re-sync
      </Button>
      <Button size="sm" onClick={() => doSync(false)} disabled={syncing} className="gap-1.5 cursor-pointer">
        {syncing
          ? <Loader2 size={13} className="animate-spin" />
          : <RefreshCw size={13} />
        }
        {syncing ? 'Syncing…' : 'Sync'}
      </Button>
    </div>
  )
}
