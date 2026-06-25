import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from './dal'

// Defense-in-depth: proxy.ts already blocks unauthenticated /api requests,
// but Route Handlers should not rely solely on it (see Next.js auth guide —
// Proxy must not be the only line of defense).
export async function requireAuth(): Promise<NextResponse | null> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

// Vercel Cron invocations carry no session cookie; instead Vercel sends the
// CRON_SECRET env var as a Bearer token in the Authorization header. A route
// that allows cron access checks for it here. Returns false when CRON_SECRET is
// unset so cron auth can never silently succeed against an empty secret.
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

// Route Handlers (unlike Server Actions) get no automatic CSRF protection
// from Next.js, so state-changing routes verify the Origin header matches
// the Host header themselves — the same check Next.js applies to Server
// Actions internally.
export function verifySameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin')
  // Same-site requests always send Origin for state-changing methods in
  // modern browsers; a request with no Origin here is not a normal browser
  // fetch/form submission and is rejected.
  if (!origin) {
    return NextResponse.json({ error: 'Missing Origin header' }, { status: 403 })
  }
  const host = req.headers.get('host')
  if (!host || new URL(origin).host !== host) {
    return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
  }
  return null
}
