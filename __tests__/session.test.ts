import { encryptSession, decryptSession, verifyPassword } from '@/lib/session'

describe('session encryption', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, SESSION_SECRET: 'a'.repeat(32) }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('round-trips a valid session token', async () => {
    const token = await encryptSession({ authenticated: true })
    const session = await decryptSession(token)
    expect(session).toEqual({ authenticated: true })
  })

  it('rejects a tampered token', async () => {
    const token = await encryptSession({ authenticated: true })
    const tampered = token.slice(0, -4) + 'abcd'
    expect(await decryptSession(tampered)).toBeNull()
  })

  it('rejects undefined/empty input', async () => {
    expect(await decryptSession(undefined)).toBeNull()
    expect(await decryptSession('')).toBeNull()
  })

  it('throws if SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET
    await expect(encryptSession({ authenticated: true })).rejects.toThrow(/SESSION_SECRET/)
  })

  it('throws if SESSION_SECRET is too short', async () => {
    process.env.SESSION_SECRET = 'short'
    await expect(encryptSession({ authenticated: true })).rejects.toThrow(/SESSION_SECRET/)
  })
})

describe('verifyPassword', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, APP_PASSWORD: 'correct-horse-battery-staple' }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('returns true for the correct password', () => {
    expect(verifyPassword('correct-horse-battery-staple')).toBe(true)
  })

  it('returns false for an incorrect password', () => {
    expect(verifyPassword('wrong')).toBe(false)
  })

  it('returns false for a wrong password of different length without throwing', () => {
    // timingSafeEqual throws on length mismatch if inputs aren't pre-hashed
    // to a fixed digest size first — this guards against that regression.
    expect(() => verifyPassword('a-much-much-much-longer-wrong-password-here')).not.toThrow()
    expect(verifyPassword('a-much-much-much-longer-wrong-password-here')).toBe(false)
  })

  it('throws if APP_PASSWORD is not configured', () => {
    delete process.env.APP_PASSWORD
    expect(() => verifyPassword('anything')).toThrow(/APP_PASSWORD/)
  })
})
