import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromCookieHeader } from '@/lib/session'

// Optimistic auth check only (per Next.js guidance, Proxy must not be the
// only line of defense — it just pre-filters unauthenticated requests
// before they reach a page or Route Handler). Page-level/DAL checks
// (lib/dal.ts) and per-route checks in API handlers still apply.
// /api/plaid/webhook is called by Plaid with no session cookie; it
// authenticates the caller by verifying Plaid's JWT signature on the request
// body, so the session gate must let it through (otherwise every webhook 401s
// here before reaching the handler and sync silently never runs).
const PUBLIC_PATHS = ['/login', '/api/plaid/webhook']

const isDev = process.env.NODE_ENV === 'development'

// Per-request nonce CSP. Next.js App Router streams Server Component data to
// the client via inline <script>self.__next_f.push(...)</script> tags — this
// is core to hydration, not optional — so a CSP without 'unsafe-inline' or a
// nonce silently breaks all client-side interactivity site-wide (confirmed:
// it did, in production, before this fix). Nonces let us keep script-src
// strict without that tradeoff. This requires every page to render
// dynamically, which the auth gate already forces (every page reads the
// session cookie), so there's no rendering-strategy cost to switching to
// nonces from the previous static policy.
function buildCspHeader(nonce: string): string {
  return `
    default-src 'self';
    script-src 'self' https://cdn.plaid.com 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https://*.plaid.com;
    font-src 'self';
    connect-src 'self' https://*.plaid.com;
    frame-src https://cdn.plaid.com https://*.plaid.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim()
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const cspHeader = buildCspHeader(nonce)

  // Forward the nonce to the page (via x-nonce) so Server Components can read
  // it with headers() and pass it to any manual <Script> tags, and set it on
  // the request headers so Next's own renderer applies it to its
  // framework/page scripts — see content-security-policy guide.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', cspHeader)

  function withCsp(response: NextResponse): NextResponse {
    response.headers.set('Content-Security-Policy', cspHeader)
    return response
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  const session = await readSessionFromCookieHeader(req.headers.get('cookie'))

  if (!session) {
    if (pathname.startsWith('/api')) {
      // The cron sync authenticates with a Bearer CRON_SECRET (validated in the
      // route itself), not a session cookie, so let it past the optimistic gate.
      const isCronSync =
        pathname === '/api/plaid/sync' &&
        req.headers.get('authorization')?.startsWith('Bearer ')
      if (isCronSync) {
        return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
      }
      return withCsp(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    const loginUrl = new URL('/login', req.nextUrl)
    return withCsp(NextResponse.redirect(loginUrl))
  }

  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }))
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and the Next.js internals —
     * including /api, so unauthenticated API calls are rejected before
     * reaching a Route Handler.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
}
