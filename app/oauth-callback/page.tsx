'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useRouter } from 'next/navigation'

export default function OAuthCallbackPage() {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // MUST be inside useEffect — window is not available during SSR
    setReceivedRedirectUri(window.location.href)
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.link_token) {
          setLinkToken(data.link_token)
        } else {
          setError('Failed to initialise Plaid. Please refresh and try again.')
        }
      })
      .catch(() => setError('Failed to reach server. Please refresh and try again.'))
  }, [])

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string } | null }) => {
      setLoading(true)
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata?.institution?.name ?? 'Unknown',
        }),
      })
      if (!res.ok) {
        setError('Connection failed. Please try again.')
        setLoading(false)
        return
      }
      router.push('/')
    },
    [router],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    receivedRedirectUri: receivedRedirectUri ?? undefined,
    onSuccess,
  })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return (
    <main className="flex min-h-screen items-center justify-center">
      {error ? (
        <p className="text-red-500 text-sm">{error}</p>
      ) : (
        <p className="text-muted-foreground">{loading ? 'Connecting…' : 'Completing connection…'}</p>
      )}
    </main>
  )
}
