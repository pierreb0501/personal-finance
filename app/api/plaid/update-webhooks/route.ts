import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { plaidClient } from '@/lib/plaid'
import { requireAuth, verifySameOrigin } from '@/lib/api-auth'

// One-time route to register the webhook URL on all existing Plaid items.
// Call once after deploying webhook support, then this route can be deleted.
export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const csrfError = verifySameOrigin(req)
  if (csrfError) return csrfError

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set' }, { status: 500 })
  }

  const allItems = await db.select().from(items).all()
  const results: { institution: string; ok: boolean; error?: string }[] = []

  for (const item of allItems) {
    try {
      await plaidClient.itemWebhookUpdate({
        access_token: item.accessToken,
        webhook: `${webhookUrl}/api/plaid/webhook`,
      })
      results.push({ institution: item.institutionName, ok: true })
    } catch (err) {
      results.push({ institution: item.institutionName, ok: false, error: (err as Error).message })
    }
  }

  return NextResponse.json({ results })
}
