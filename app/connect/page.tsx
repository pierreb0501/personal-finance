'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function ConnectPage() {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then((r) => r.json())
      .then((data) => setLinkToken(data.link_token))
  }, [])

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { name?: string } | null }) => {
      setLoading(true)
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
    [router],
  )

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  })

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Connect a bank account</h1>
        <p className="text-muted-foreground">
          Connect TD, Amex Canada, or Wealthsimple to get started.
        </p>
        <Button onClick={() => open()} disabled={!ready || loading}>
          {loading ? 'Connecting…' : 'Connect a bank'}
        </Button>
      </div>
    </main>
  )
}
