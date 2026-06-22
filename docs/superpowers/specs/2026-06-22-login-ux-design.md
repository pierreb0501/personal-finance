# Login page UX/visual overhaul — design

## Context

The app now sits behind a single shared-password gate (`app/login/`, `lib/session.ts`, `lib/dal.ts`, `proxy.ts` — see prior auth-hardening work). The login page was built quickly during that pass and visually doesn't match the rest of the app: it borrows generic shadcn dark-mode tokens (`bg-background`, `text-foreground`) from the `/connect` page, while every other screen (dashboard, sidebar, budget, etc.) uses the app's actual warm palette — cream canvas, Fraunces serif headlines, hairline borders, `--accent-dark` green accent.

This is a presentational + small-functional pass over the login page only. No changes to session mechanics, CSRF, or the rate-limiting *logic* — only how its result is surfaced to the user.

## Goals

1. Restyle the login page to match the rest of the app's design system exactly.
2. Add a password visibility toggle.
3. Polish the loading state during sign-in.
4. Give the rate-limited ("too many attempts") state a visually distinct treatment with a live countdown, instead of looking like a plain typo error.

## Explicitly out of scope

- "Stay signed in" / session-duration toggle — sessions stay a flat 30 days.
- Forgot-password / "don't have access" guidance text — silent, ask-the-owner-directly model.
- Surfacing remaining-attempts count before lockout (avoids telegraphing the threshold).
- Any change to session JWT mechanics, CSRF checks, or proxy-level redirect behavior.

## Visual direction

Approved via mockup (see `.superpowers/brainstorm/` session): on-brand minimal. Same centered-card shape as today, restyled with the app's real tokens:

- Page background: `--canvas`
- Card: white, `--hairline` border, same radius/shadow as other cards app-wide
- Icon tile: small rounded square, `--positive`-tinted background, lock icon
- Heading: Fraunces serif, "Welcome back"
- Subheading: "Sign in to your dashboard" (muted text)
- Button: `--accent-dark` background, white text

## Functional changes

### 1. Password visibility toggle

Client-side only, in `LoginForm.tsx`. `useState<boolean>` toggles the input's `type` between `password` and `text`. An eye icon (lucide `Eye`/`EyeOff`) sits inside the input, right-aligned. No server involvement.

### 2. Loading state polish

`useActionState`'s `pending` flag already exists. Currently only the button disables and its text changes. Change to:
- Button: small spinner icon (lucide `Loader2`, spinning) + "Signing in…" text, disabled
- Password input: also disabled during submit (prevents a queued second submission with stale state)
- Card: subtle opacity reduction (~0.85) while pending, as a secondary visual cue

### 3. Rate-limit lockout state (the one real functional change)

**Backend:** `isLoginRateLimited(db, ip)` in `lib/db/queries.ts` currently returns a bare `boolean`. Change its return type to:

```ts
type RateLimitStatus = { limited: false } | { limited: true; retryAfterSeconds: number }
```

`retryAfterSeconds` is computed from the existing `windowStart` + `LOGIN_ATTEMPT_WINDOW_MS` minus `Date.now()`, floored at 0. This requires no schema change — `windowStart` is already stored.

**Action:** `login()` in `app/login/actions.ts` changes its early-return on rate limit from a flat string to passing `retryAfterSeconds` through. `LoginState` becomes a discriminated union:

```ts
type LoginState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'locked'; retryAfterSeconds: number }
```

(`initialState` in `LoginForm.tsx` becomes `{ kind: 'idle' }`.)

**UI:** On `kind: 'locked'`, the password input + submit button are replaced (not just hidden) by an amber-tinted panel: "Too many attempts" + a large countdown timer (`MM:SS`, decremented client-side via `setInterval`) + a one-line explanation. This countdown is cosmetic only — actual enforcement is still server-side via `isLoginRateLimited` on the next real submit. When the client countdown reaches 0, the panel automatically reverts to the normal form (the user can then try again; if they're still somehow within the window server-side due to clock drift, they'll just see the lockout panel again on submit).

On `kind: 'error'` (wrong password), behavior stays as today: red inline text below the input, password field cleared, refocused — no panel swap.

## Testing

Add a case to `__tests__/db.test.ts` asserting `isLoginRateLimited` returns `{ limited: true, retryAfterSeconds: N }` with `N` close to the configured window when freshly limited, and `{ limited: false }` once the window has elapsed (reuse the existing fake-clock-free pattern already in that file — insert a row with a `windowStart` in the past beyond `LOGIN_ATTEMPT_WINDOW_MS`).

No new browser/e2e test. Existing `npx tsc --noEmit` / `npm test` / `npx next build` cycle covers correctness; the visual result is confirmed manually (as during the original auth rollout).

## Files touched

- `app/login/LoginForm.tsx` — visual restyle, password toggle, loading polish, lockout panel
- `app/login/actions.ts` — `LoginState` shape change, pass `retryAfterSeconds`
- `lib/db/queries.ts` — `isLoginRateLimited` return type change
- `__tests__/db.test.ts` — new rate-limit-status test case
