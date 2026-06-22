import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { decryptSession, SESSION_COOKIE } from './session'

// For Server Components / pages: verifies the session and redirects to
// /login if missing or invalid. Cached per-request so multiple call sites
// in one render pass only decrypt the cookie once.
export const verifySession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  const session = await decryptSession(token)
  if (!session) {
    redirect('/login')
  }
  return session
})

// For Route Handlers: same check, but returns null instead of redirecting
// (a redirect makes no sense for a fetch()-based API caller) so the caller
// can return a 401 Response.
export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return decryptSession(token)
}
