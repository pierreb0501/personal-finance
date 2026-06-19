import { NextRequest, NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { CountryCode, Products } from 'plaid'

export async function POST(req: NextRequest) {
  try {
    const { itemId } = await req.json().catch(() => ({ itemId: undefined }))

    // Update mode: re-authenticate an existing broken item rather than linking a new one
    if (itemId) {
      const item = await db.select().from(items).where(eq(items.id, itemId)).get()
      if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: 'user-1' },
        client_name: 'Personal Finance',
        access_token: item.accessToken,
        language: 'en',
        country_codes: [CountryCode.Ca, CountryCode.Us],
        ...(process.env.NEXT_PUBLIC_APP_URL
          ? { redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/oauth-callback` }
          : {}),
      })
      return NextResponse.json({ link_token: response.data.link_token })
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'user-1' },
      client_name: 'Personal Finance',
      products: [Products.Transactions],
      optional_products: [Products.Investments],
      country_codes: [CountryCode.Ca, CountryCode.Us],
      language: 'en',
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? { redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/oauth-callback` }
        : {}),
    })
    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err) {
    console.error('create-link-token error:', err)
    return NextResponse.json({ error: 'Failed to create link token' }, { status: 500 })
  }
}
