'use client'

import { useActionState, useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { login, type LoginState } from './actions'

const initialState: LoginState = { kind: 'idle' }

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Cosmetic countdown only — actual enforcement is server-side via
// isLoginRateLimited on the next real submit. If the client clock drifts
// and the user is still within the window when they retry, they'll just
// see this panel again.
function LockoutPanel({ retryAfterSeconds }: { retryAfterSeconds: number }) {
  const [remaining, setRemaining] = useState(retryAfterSeconds)

  useEffect(() => {
    setRemaining(retryAfterSeconds)
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [retryAfterSeconds])

  if (remaining <= 0) {
    return (
      <p className="text-[13px] text-[var(--muted-text)] text-center">
        You can try again now.
      </p>
    )
  }

  return (
    <div className="bg-[#fdf6e3] border border-[#e8d89a] rounded-[12px] p-4 text-center">
      <p className="text-[13px] font-semibold text-[#7a5f00]">Too many attempts</p>
      <p className="font-[family-name:var(--font-fraunces)] text-[22px] text-[#7a5f00] mt-1 tabular-nums">
        {formatCountdown(remaining)}
      </p>
      <p className="text-[12px] text-[#a08020] mt-1">
        Try again once the timer runs out
      </p>
    </div>
  )
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState)
  const [showPassword, setShowPassword] = useState(false)
  const isLocked = state.kind === 'locked'

  return (
    <form
      action={formAction}
      className={[
        'w-full max-w-sm bg-white rounded-[18px] border border-[var(--hairline)] p-7 card-shadow transition-opacity',
        pending ? 'opacity-[0.85]' : '',
      ].join(' ')}
    >
      <div className="flex justify-center">
        <div className="w-12 h-12 rounded-[14px] bg-[#e6f1ea] flex items-center justify-center">
          <Lock size={20} className="text-[var(--accent-dark)]" />
        </div>
      </div>

      <div className="text-center mt-4 mb-6">
        <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[22px] text-[var(--ink)]">
          Welcome back
        </h1>
        <p className="text-[13px] text-[var(--muted-text)] mt-1">
          Sign in to your dashboard
        </p>
      </div>

      {isLocked ? (
        <LockoutPanel retryAfterSeconds={state.retryAfterSeconds} />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoFocus
              autoComplete="current-password"
              placeholder="Password"
              disabled={pending}
              className="w-full px-3 py-2.5 pr-10 text-[14px] rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--accent-dark)] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={pending}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--faint)] hover:text-[var(--muted-text)] transition-colors cursor-pointer disabled:opacity-50"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {state.kind === 'error' && (
            <p className="text-[13px] text-[var(--negative)] text-center" role="alert">{state.message}</p>
          )}

          <Button type="submit" className="w-full cursor-pointer gap-1.5" disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      )}
    </form>
  )
}
