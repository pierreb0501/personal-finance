import { NextResponse } from 'next/server'
import { plaidClient } from '@/lib/plaid'
import { CountryCode, Products } from 'plaid'

export async function POST() {
  try {
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
