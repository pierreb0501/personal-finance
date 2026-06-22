import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { CountryCode, Products } from 'plaid'
import { isAxiosError } from 'axios'
import { requireAuth, verifySameOrigin } from '@/lib/api-auth'

// Plaid rejects link_token/create with INVALID_FIELD if redirect_uri isn't
// registered in the dashboard for this environment. Retry without it so
// non-OAuth institutions still work while the dashboard config is pending.
function isUnregisteredRedirectUriError(err: unknown): boolean {
  return (
    isAxiosError(err) &&
    err.response?.data?.error_code === 'INVALID_FIELD' &&
    typeof err.response?.data?.error_message === 'string' &&
    err.response.data.error_message.includes('redirect_uri')
  )
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const csrfError = verifySameOrigin(req)
  if (csrfError) return csrfError

  try {
    const { itemId } = await req.json().catch(() => ({ itemId: undefined }))

    // Update mode: re-authenticate an existing broken item rather than linking a new one
    if (itemId) {
      const item = await db.select().from(items).where(eq(items.id, itemId)).get()
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

      const params = {
        user: { client_user_id: 'user-1' },
        client_name: 'Personal Finance',
        access_token: item.accessToken,
        language: 'en',
        country_codes: [CountryCode.Ca, CountryCode.Us],
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/oauth-callback` }
          : {}),
      }
      try {
        const response = await plaidClient.linkTokenCreate(params)
        return NextResponse.json({ link_token: response.data.link_token })
      } catch (err) {
        if (!isUnregisteredRedirectUriError(err)) throw err
        const { redirect_uri: _redirect_uri, ...fallbackParams } = params
        const response = await plaidClient.linkTokenCreate(fallbackParams)
        return NextResponse.json({ link_token: response.data.link_token })
      }
    }

    const params = {
      user: { client_user_id: 'user-1' },
      client_name: 'Personal Finance',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Ca, CountryCode.Us],
      language: 'en',
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? { redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/oauth-callback` }
        : {}),
    }
    try {
      const response = await plaidClient.linkTokenCreate(params)
      return NextResponse.json({ link_token: response.data.link_token })
    } catch (err) {
      if (!isUnregisteredRedirectUriError(err)) throw err
      const { redirect_uri: _redirect_uri, ...fallbackParams } = params
      const response = await plaidClient.linkTokenCreate(fallbackParams)
      return NextResponse.json({ link_token: response.data.link_token })
    }
  } catch (err) {
    console.error('create-link-token error:', err)
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 })
  }
}
