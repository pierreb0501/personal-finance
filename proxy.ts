import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromCookieHeader } from '@/lib/session'

// Optimistic auth check only (per Next.js guidance, Proxy must not be the
// only line of defense — it just pre-filters unauthenticated requests
// before they reach a page or Route Handler). Page-level/DAL checks
// (lib/dal.ts) and per-route checks in API handlers still apply.
const PUBLIC_PATHS = ['/login']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next()
  }

  const session = await readSessionFromCookieHeader(req.headers.get('cookie'))

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.nextUrl)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
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
