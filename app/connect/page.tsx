'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { ArrowLeft, Loader2, Building2, Shield, Lock } from 'lucide-react'

export default function ConnectPage() {
  const router = useRouter()
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
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

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess })

  return (
    <main className="min-h-dvh bg-background flex flex-col">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        <Link
          href="/"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <ArrowLeft size={14} />
          Back
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Building2 size={24} className="text-primary" />
            </div>
          </div>

          {/* Copy */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Connect a bank account
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Link your bank, credit card, or investment account via Plaid. Read-only access — we never touch your money.
            </p>
          </div>

          {/* Trust signals */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Shield, label: 'Read-only access' },
              { icon: Lock, label: '256-bit encryption' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary/50 border border-border/60"
              >
                <Icon size={13} className="text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <Button
            className="w-full cursor-pointer gap-2"
            onClick={() => open()}
            disabled={!ready || loading}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Connecting…' : 'Connect a bank'}
          </Button>

          {!ready && !error && (
            <p className="text-center text-xs text-muted-foreground">Preparing secure connection…</p>
          )}
        </div>
      </div>
    </main>
  )
}
