# Login UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the login page to match the rest of the app's design system, and add a password visibility toggle, polished loading state, and a visually distinct rate-limit lockout panel with a live countdown.

**Architecture:** Three files change. `lib/db/queries.ts`'s `isLoginRateLimited` changes its return type from `boolean` to a discriminated `{ limited: false } | { limited: true; retryAfterSeconds: number }` so callers know *how long* to wait, not just *that* they're blocked. `app/login/actions.ts`'s `LoginState` becomes a discriminated union (`idle` / `error` / `locked`) carrying that countdown through to the client. `app/login/LoginForm.tsx` gets restyled with the app's existing design tokens and renders a different UI branch per `LoginState.kind`.

**Tech Stack:** Next.js Server Actions + `useActionState`, Tailwind (arbitrary-value classes matching existing app conventions), `lucide-react` icons.

**Reference spec:** `docs/superpowers/specs/2026-06-22-login-ux-design.md`

---

### Task 1: Change `isLoginRateLimited` to return retry-after time

**Files:**
- Modify: `lib/db/queries.ts:1112-1126`
- Test: `__tests__/db.test.ts`

This is the one functional/data-flow change in the whole plan — everything else is presentational. Do this first and get it fully tested before touching the UI, since `actions.ts` and `LoginForm.tsx` both depend on the new shape.

- [ ] **Step 1: Write the failing tests**

Open `__tests__/db.test.ts`. Add `isLoginRateLimited` to the existing import block from `@/lib/db/queries` (it currently imports `getLatestSnapshot`, `getMonthlySpend`, etc. — add `isLoginRateLimited` to that list, alphabetical position doesn't matter, just keep it readable).

Add this new `describe` block right before the final closing `})` of the outer `describe('query functions', ...)` block (i.e. as a sibling to the existing `describe('custom categories', ...)` block, after it):

```ts
  describe('isLoginRateLimited', () => {
    const IP = '1.2.3.4'

    it('returns limited:false when no attempts have been recorded', async () => {
      const status = await isLoginRateLimited(db, IP)
      expect(status).toEqual({ limited: false })
    })

    it('returns limited:false when under the attempt threshold within the window', async () => {
      db.insert(schema.loginAttempts).values({ ip: IP, count: 3, windowStart: Date.now() }).run()
      const status = await isLoginRateLimited(db, IP)
      expect(status).toEqual({ limited: false })
    })

    it('returns limited:true with a retryAfterSeconds close to the full window when freshly limited', async () => {
      db.insert(schema.loginAttempts).values({ ip: IP, count: 8, windowStart: Date.now() }).run()
      const status = await isLoginRateLimited(db, IP)
      expect(status.limited).toBe(true)
      if (status.limited) {
        // Window is 10 minutes (600s) — freshly limited should be very close to that, allowing for test execution time.
        expect(status.retryAfterSeconds).toBeGreaterThan(595)
        expect(status.retryAfterSeconds).toBeLessThanOrEqual(600)
      }
    })

    it('returns limited:false once the window has fully elapsed', async () => {
      const elevenMinutesAgo = Date.now() - 11 * 60 * 1000
      db.insert(schema.loginAttempts).values({ ip: IP, count: 8, windowStart: elevenMinutesAgo }).run()
      const status = await isLoginRateLimited(db, IP)
      expect(status).toEqual({ limited: false })
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/db.test.ts -t "isLoginRateLimited"`
Expected: FAIL — TypeScript error or runtime failure, since `isLoginRateLimited` isn't exported with this name change yet and currently returns a plain `boolean`, so `status.limited`/`.toEqual({ limited: false })` won't match `false`/`true`.

(If `npx jest` reports a TS compile error rather than a test failure, that's fine — it still confirms the test is exercising code that doesn't yet match the new shape.)

- [ ] **Step 3: Implement the new return type**

In `lib/db/queries.ts`, replace lines 1112-1126 (the comment header through the end of `isLoginRateLimited`) with:

```ts
// ─── Login rate limiting ──────────────────────────────────────────────────────

const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const LOGIN_ATTEMPT_MAX = 8

export type LoginRateLimitStatus =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number }

// Returns whether `ip` is currently allowed to attempt a login, and if not,
// how many seconds remain in the lockout window (so the UI can show a
// countdown). Does not itself record an attempt — call
// recordFailedLoginAttempt() after a failed password check.
export async function isLoginRateLimited(db: DB, ip: string): Promise<LoginRateLimitStatus> {
  const row = await db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.ip, ip)).get()
  if (!row) return { limited: false }

  const elapsedMs = Date.now() - row.windowStart
  if (elapsedMs > LOGIN_ATTEMPT_WINDOW_MS) return { limited: false }
  if (row.count < LOGIN_ATTEMPT_MAX) return { limited: false }

  const retryAfterSeconds = Math.max(0, Math.ceil((LOGIN_ATTEMPT_WINDOW_MS - elapsedMs) / 1000))
  return { limited: true, retryAfterSeconds }
}
```

Leave `recordFailedLoginAttempt` and `clearLoginAttempts` (the functions immediately below it) untouched — they don't change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/db.test.ts -t "isLoginRateLimited"`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: All existing tests still pass. `tsc --noEmit` will likely stay **clean** even though `app/login/actions.ts` still calls `isLoginRateLimited` expecting the old boolean shape — `if (someObject)` type-checks fine in TypeScript since any non-`void` object is truthy, so this is a silent *runtime* bug, not a compile error. **This means after this task alone, `app/login/actions.ts` will treat every login attempt as rate-limited (since `{ limited: false }` is itself truthy) — login is completely broken until Task 2 lands.** This is expected mid-plan, but it is a real deploy-order hazard: do not push this commit alone to a branch that auto-deploys (this repo deploys to Vercel on push to `main`). Proceed directly to Task 2 before pushing anything.

- [ ] **Step 6: Commit**

```bash
git add lib/db/queries.ts __tests__/db.test.ts
git commit -m "feat: return retry-after time from isLoginRateLimited"
```

---

### Task 2: Thread the lockout state through the login Server Action

**Files:**
- Modify: `app/login/actions.ts` (full file rewrite — it's short)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/login/actions.ts` with:

```ts
'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { createSession, deleteSession, verifyPassword } from '@/lib/session'
import { isLoginRateLimited, recordFailedLoginAttempt, clearLoginAttempts } from '@/lib/db/queries'

export type LoginState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'locked'; retryAfterSeconds: number }

async function getClientIp(): Promise<string> {
  const h = await headers()
  // x-forwarded-for can be a comma-separated list; the first entry is the
  // original client as seen by the nearest proxy that set the header.
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return h.get('x-real-ip') ?? 'unknown'
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get('password')
  if (typeof password !== 'string' || password.length === 0) {
    return { kind: 'error', message: 'Password is required' }
  }

  const ip = await getClientIp()

  const rateLimitStatus = await isLoginRateLimited(db, ip)
  if (rateLimitStatus.limited) {
    return { kind: 'locked', retryAfterSeconds: rateLimitStatus.retryAfterSeconds }
  }

  let valid: boolean
  try {
    valid = verifyPassword(password)
  } catch (err) {
    console.error('Login failed — server misconfiguration:', (err as Error).message)
    return { kind: 'error', message: 'Server is not configured for login. Contact the administrator.' }
  }

  if (!valid) {
    await recordFailedLoginAttempt(db, ip)
    return { kind: 'error', message: 'Incorrect password' }
  }

  await clearLoginAttempts(db, ip)
  await createSession()
  redirect('/')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: New errors now appear in `app/login/LoginForm.tsx` (it still references `state.error` and uses `{ error: null }` as initial state, which no longer exists on the `LoginState` type). That's expected — Task 3 fixes it. Confirm no errors remain in `lib/db/queries.ts` or `app/login/actions.ts` themselves.

- [ ] **Step 3: Commit**

```bash
git add app/login/actions.ts
git commit -m "feat: thread rate-limit countdown through LoginState"
```

(Don't run the full test suite yet — `LoginForm.tsx` is still broken until Task 3. `npx jest` itself will still pass since no test imports `LoginForm.tsx`, but the build/typecheck won't be clean until Task 3 is done.)

---

### Task 3: Restyle LoginForm and add password toggle, loading polish, lockout panel

**Files:**
- Modify: `app/login/LoginForm.tsx` (full file rewrite)
- Modify: `app/login/page.tsx:12` (background token only)

- [ ] **Step 1: Replace `app/login/page.tsx`'s background class**

In `app/login/page.tsx`, change line 12 from:

```tsx
    <main className="min-h-dvh bg-background flex items-center justify-center px-4">
```

to:

```tsx
    <main className="min-h-dvh bg-[var(--canvas)] flex items-center justify-center px-4">
```

This is the only change to this file — it currently uses the generic shadcn `bg-background` token; the rest of the app uses `var(--canvas)` directly (see `app/layout.tsx`'s `<body>` class).

- [ ] **Step 2: Replace the entire contents of `app/login/LoginForm.tsx`**

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Clean, no errors anywhere.

- [ ] **Step 4: Run the full test suite**

Run: `npx jest`
Expected: All tests pass (the rate-limit tests from Task 1, plus everything else — nothing in this task touches test-covered logic, this step is a regression check).

- [ ] **Step 5: Production build**

Run: `npx next build`
Expected: Builds cleanly, no new errors. (You'll need dummy env vars if running outside an environment with real ones — see `.env.example` / `.github/workflows/ci.yml` for the full required set: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `APP_PASSWORD`.)

- [ ] **Step 6: Manual smoke test**

Run `npm run dev`, open `/login` in a browser:
- Confirm the card matches the app's visual style (cream background, white card, Fraunces "Welcome back" heading, green lock icon) — not the old generic dark-mode look.
- Click the eye icon — password field should toggle between hidden/visible text.
- Submit with the wrong password — should show red "Incorrect password" text, same as before.
- Submit the correct password (from `.env.local`'s `APP_PASSWORD`) — should redirect to `/`.
- To see the lockout panel without waiting through 8 real attempts: temporarily lower `LOGIN_ATTEMPT_MAX` in `lib/db/queries.ts` to `1`, restart the dev server, submit one wrong password, confirm the amber lockout panel with countdown appears and counts down. **Revert `LOGIN_ATTEMPT_MAX` back to `8` before committing** — this is a manual verification step only, not a real change.

- [ ] **Step 7: Commit**

```bash
git add app/login/LoginForm.tsx app/login/page.tsx
git commit -m "feat: restyle login page, add password toggle and lockout panel"
```

---

### Task 4: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full check**

Run: `npx jest && npx tsc --noEmit && npx next build`
Expected: All three pass cleanly with no errors or warnings introduced by this work.

- [ ] **Step 2: Confirm `LOGIN_ATTEMPT_MAX` is back to 8**

Run: `grep "LOGIN_ATTEMPT_MAX" lib/db/queries.ts`
Expected: `const LOGIN_ATTEMPT_MAX = 8` — if it still shows `1` from manual testing in Task 3, fix it and commit:

```bash
git add lib/db/queries.ts
git commit -m "fix: restore LOGIN_ATTEMPT_MAX after manual testing"
```

(Skip this commit if it's already `8` — nothing to do.)

---

### Addendum: unplanned CSP fix (commit `1d3d124`)

While manually verifying Task 3 with a real browser, discovered that the CSP added during an earlier, separate security-hardening pass was blocking all client-side JS hydration site-wide (Next.js streams Server Component data via inline `<script>` tags that a strict `script-src` with no nonce/`unsafe-inline` blocks) — confirmed live-broken in production, not just locally. Out of this plan's original scope, but fixed immediately in its own commit (`proxy.ts` switched to Next's documented nonce-based CSP pattern) since it was a live, severe regression discovered as a direct result of this feature's testing. See commit message for full detail and verification steps.
