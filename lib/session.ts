import 'server-only'
import { createHash, timingSafeEqual } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'pf_session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET env var must be set to a random string of at least 32 characters (e.g. `openssl rand -base64 32`)',
    )
  }
  return new TextEncoder().encode(secret)
}

type SessionPayload = {
  authenticated: true
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Date.now() + SESSION_DURATION_MS)
    .sign(getSecretKey())
}

export async function decryptSession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
    if (payload.authenticated !== true) return null
    return { authenticated: true }
  } catch {
    return null
  }
}

export async function createSession(): Promise<void> {
  const token = await encryptSession({ authenticated: true })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + SESSION_DURATION_MS),
  })
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

// Reads the session cookie directly from a Request (for use in Route Handlers
// and proxy.ts, where next/headers' cookies() isn't always the right tool).
export async function readSessionFromCookieHeader(cookieHeader: string | null): Promise<SessionPayload | null> {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))
  if (!match) return null
  return decryptSession(decodeURIComponent(match[1]))
}

// Constant-time password check. Both inputs are hashed to a fixed-length
// digest first so timingSafeEqual never throws on a length mismatch (which
// would itself leak the correct password's length) and so comparison time
// never depends on how many leading characters happen to match.
export function verifyPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD
  if (!expected) {
    throw new Error('APP_PASSWORD env var must be set')
  }
  const inputHash = createHash('sha256').update(input).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(inputHash, expectedHash)
}

export { SESSION_COOKIE }
