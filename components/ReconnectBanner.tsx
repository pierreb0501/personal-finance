'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { describePlaidError } from '@/lib/plaid-errors'

type BrokenItem = { id: string; institutionName: string; errorCode: string | null }

function ReconnectItem({ item, onDone }: { item: BrokenItem; onDone: () => void }) {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchTokenAndOpen = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/plaid/create-link-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    })
    const data = await res.json()
    if (data.link_token) setLinkToken(data.link_token)
    else setLoading(false)
  }, [item.id])

  const onSuccess = useCallback(async () => {
    await fetch('/api/plaid/confirm-reauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    })
    setLoading(false)
    onDone()
    router.refresh()
  }, [item.id, onDone, router])

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess })

  // Once the link token is ready, open Link immediately
  useEffect(() => {
    if (linkToken && ready) {
      open()
      setLinkToken(null) // prevent re-opening on re-render
    }
  }, [linkToken, ready, open])

  return (
    <button
      onClick={fetchTokenAndOpen}
      disabled={loading}
      title={describePlaidError(item.errorCode)}
      className="text-[12px] font-medium underline underline-offset-2 hover:no-underline cursor-pointer disabled:opacity-60"
    >
      {loading ? <Loader2 size={11} className="inline animate-spin mr-1" /> : null}
      Reconnect {item.institutionName}
    </button>
  )
}

export function ReconnectBanner({ items }: { items: BrokenItem[] }) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const visible = items.filter((i) => !dismissed.includes(i.id))

  if (visible.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800">
      <AlertTriangle size={13} className="shrink-0" />
      <span className="text-[12px]">
        {visible.length === 1
          ? describePlaidError(visible[0].errorCode)
          : `${visible.length} account connections need attention:`}
      </span>
      <div className="flex items-center gap-3">
        {visible.map((item) => (
          <ReconnectItem
            key={item.id}
            item={item}
            onDone={() => setDismissed((d) => [...d, item.id])}
          />
        ))}
      </div>
    </div>
  )
}
