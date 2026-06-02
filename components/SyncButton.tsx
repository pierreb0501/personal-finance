'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/plaid/sync', { method: 'POST' })
      router.refresh()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5 cursor-pointer">
      {syncing
        ? <Loader2 size={13} className="animate-spin" />
        : <RefreshCw size={13} />
      }
      {syncing ? 'Syncing…' : 'Sync'}
    </Button>
  )
}
