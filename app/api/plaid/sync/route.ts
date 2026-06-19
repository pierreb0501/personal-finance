import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { syncAll } from '@/lib/sync'

export async function POST(req: NextRequest) {
  try {
    const { force } = await req.json().catch(() => ({ force: false }))

    if (force) {
      // Reset all cursors so the next sync re-fetches full transaction history
      db.update(items).set({ cursor: null }).run()
    }

    await syncAll()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
