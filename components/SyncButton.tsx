'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function SyncButton() {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    await fetch('/api/plaid/sync', { method: 'POST' })
    setSyncing(false)
    router.refresh()
  }

  return (
    <Button size="sm" onClick={handleSync} disabled={syncing}>
      {syncing ? 'Syncing…' : 'Sync now'}
    </Button>
  )
}
