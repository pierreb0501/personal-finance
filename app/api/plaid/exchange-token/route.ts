import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { syncAll } from '@/lib/sync'
import { requireAuth, verifySameOrigin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const csrfError = verifySameOrigin(req)
  if (csrfError) return csrfError

  try {
    const { public_token, institution_name } = await req.json()

    if (!public_token || typeof public_token !== 'string') {
      return NextResponse.json({ error: 'public_token is required' }, { status: 400 })
    }
    if (institution_name !== undefined && typeof institution_name !== 'string') {
      return NextResponse.json({ error: 'institution_name must be a string' }, { status: 400 })
    }

    const exchangeRes = await plaidClient.itemPublicTokenExchange({
      public_token: public_token,
    })
    const { access_token, item_id } = exchangeRes.data

    db.insert(items).values({
      id: crypto.randomUUID(),
      plaidItemId: item_id,
      accessToken: access_token,
      cursor: null,
      institutionName: institution_name?.trim() || 'Unknown',
      createdAt: Math.floor(Date.now() / 1000),
    }).run()

    await syncAll()

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('exchange-token error:', err)
    return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 })
  }
}
