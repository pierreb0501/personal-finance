import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { decodeProtectedHeader, importJWK, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { syncItem } from '@/lib/sync'
import { plaidClient } from '@/lib/plaid'

// Plaid signs every webhook with a JWT in the Plaid-Verification header.
// We verify it before acting on the payload.
async function verifyPlaidWebhook(req: NextRequest, rawBody: string): Promise<boolean> {
  const token = req.headers.get('plaid-verification')
  if (!token) return false

  try {
    const { kid } = decodeProtectedHeader(token)
    if (!kid) return false

    const keyResponse = await plaidClient.webhookVerificationKeyGet({ key_id: kid })
    const jwk = keyResponse.data.key

    const publicKey = await importJWK(jwk as Parameters<typeof importJWK>[0], jwk.alg as string)
    const { payload } = await jwtVerify(token, publicKey)

    // Confirm the JWT was issued for this exact request body
    const expectedHash = createHash('sha256').update(rawBody).digest('hex')
    return (payload as { request_body_sha256?: string }).request_body_sha256 === expectedHash
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const verified = await verifyPlaidWebhook(req, rawBody)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  let body: { webhook_type: string; webhook_code: string; item_id: string; error?: { error_code: string } }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { webhook_type, webhook_code, item_id } = body

  // Look up item by Plaid's item_id
  const item = await db.select().from(items).where(eq(items.plaidItemId, item_id)).get()

  if (webhook_type === 'ITEM') {
    if (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION') {
      const errorCode = body.error?.error_code
      const status = errorCode === 'ITEM_LOGIN_REQUIRED' ? 'login_required' : 'error'
      if (item) {
        await db.update(items).set({ status }).where(eq(items.plaidItemId, item_id)).run()
      }
    }
    return NextResponse.json({ ok: true })
  }

  // TRANSACTIONS or INVESTMENTS_TRANSACTIONS — trigger a full sync for this item
  const shouldSync =
    (webhook_type === 'TRANSACTIONS' && webhook_code === 'SYNC_UPDATES_AVAILABLE') ||
    (webhook_type === 'INVESTMENTS_TRANSACTIONS' && webhook_code === 'DEFAULT_UPDATE')

  if (shouldSync && item) {
    // Fire-and-forget — return 200 immediately so Plaid doesn't retry.
    // Sync errors are logged inside syncItem.
    syncItem(db, item).catch((err: unknown) => {
      console.error(`Webhook-triggered sync failed for item ${item.institutionName}:`, (err as Error).message)
    })
  }

  return NextResponse.json({ ok: true })
}
