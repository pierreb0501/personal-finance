# Personal Finance

A personal finance dashboard built with Next.js: bank/credit/investment account syncing via Plaid, Amex CSV import, budget planning, recurring charge detection, and net worth tracking. Single-tenant — all data is shared across whoever can log in, gated behind one shared password.

## Setup

1. Copy `.env.example` to `.env.local` and fill in:
   - **Plaid** credentials from the [Plaid dashboard](https://dashboard.plaid.com/team/keys)
   - **Turso** database URL/token from [turso.tech](https://turso.tech)
   - `SESSION_SECRET` — generate with `openssl rand -base64 32`
   - `APP_PASSWORD` — the password used to log into the app (see [Auth](#auth) below)
2. `npm install`
3. `npm run dev` and open [http://localhost:3000](http://localhost:3000)

Database migrations run automatically on first query (see `lib/db/index.ts`); no manual migrate step needed in development.

## Auth

The whole app sits behind a single shared password (`APP_PASSWORD`) — there's no per-user accounts system; everyone who logs in sees the same data. This is intentional for now (a household/personal app), not a placeholder for something more — see `lib/session.ts`, `lib/dal.ts`, and `proxy.ts` if that changes.

Sessions are signed JWTs (`jose`) in an HttpOnly, Secure (in production), SameSite=Lax cookie, 30-day expiry. Login attempts are rate-limited per IP (DB-backed, so it holds across serverless cold starts). Route Handlers under `/api` additionally verify the `Origin` header on state-changing requests, since — unlike Server Actions — they get no automatic CSRF protection from Next.js.

**Before deploying anywhere reachable by others:** change `APP_PASSWORD` to something strong, and make sure `SESSION_SECRET` is a real random value (not committed anywhere).

## Testing

```bash
npm test          # Jest — db queries, sync logic, Amex CSV parser, session auth
npx tsc --noEmit   # typecheck
npx next build     # production build
```

CI (`.github/workflows/ci.yml`) runs all three on every push/PR to `main`.

## Stack

Next.js 16 (App Router) · Drizzle ORM · Turso (libsql) · Plaid · Tailwind · Recharts

See `AGENTS.md` for a note on this Next.js version's docs being bundled locally — check `node_modules/next/dist/docs/` before relying on training-data assumptions about App Router APIs (some conventions, like `middleware.ts` → `proxy.ts`, have changed).
