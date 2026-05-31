'use client'

import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useRouter } from 'next/navigation'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | null>(null)

  useEffect(() => {
    // MUST be inside useEffect — window is not available during SSR
    setReceivedRedirectUri(window.location.href)
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => setLinkToken(data.link_token))
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: receivedRedirectUri ?? undefined,
    onSuccess: async (publicToken, metadata) => {
      await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata?.institution?.name ?? 'Unknown',
        }),
      })
      router.push('/')
    },
  })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Completing connection…</p>
    </main>
  )
}
