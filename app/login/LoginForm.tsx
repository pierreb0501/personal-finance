'use client'

import { useActionState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { login, type LoginState } from './actions'

const initialState: LoginState = { error: null }

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-6">
      <div className="flex justify-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock size={22} className="text-primary" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Sign in
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the password to access this app.
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          disabled={pending}
          className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        />

        {state.error && (
          <p className="text-sm text-red-400 text-center" role="alert">{state.error}</p>
        )}

        <Button type="submit" className="w-full cursor-pointer" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
