'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { createSession, deleteSession, verifyPassword } from '@/lib/session'
import { isLoginRateLimited, recordFailedLoginAttempt, clearLoginAttempts } from '@/lib/db/queries'

export type LoginState = { error: string | null }

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
    return { error: 'Password is required' }
  }

  const ip = await getClientIp()

  if (await isLoginRateLimited(db, ip)) {
    return { error: 'Too many attempts. Please try again in a few minutes.' }
  }

  let valid: boolean
  try {
    valid = verifyPassword(password)
  } catch (err) {
    console.error('Login failed — server misconfiguration:', (err as Error).message)
    return { error: 'Server is not configured for login. Contact the administrator.' }
  }

  if (!valid) {
    await recordFailedLoginAttempt(db, ip)
    return { error: 'Incorrect password' }
  }

  await clearLoginAttempts(db, ip)
  await createSession()
  redirect('/')
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect('/login')
}
