import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { syncAll } from '@/lib/sync'
import { requireAuth, verifySameOrigin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const csrfError = verifySameOrigin(req)
  if (csrfError) return csrfError

  try {
    const { itemId } = await req.json().catch(() => ({ itemId: undefined }))
    if (!itemId || typeof itemId !== 'string') {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })
    }

    db.update(items).set({ status: 'ok' }).where(eq(items.id, itemId)).run()
    await syncAll()

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('confirm-reauth error:', err)
    return NextResponse.json({ error: 'Failed to confirm reconnection' }, { status: 500 })
  }
}
