import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items } from '@/lib/db/schema'
import { syncAll } from '@/lib/sync'
import { isAuthorizedCron, requireAuth, verifySameOrigin } from '@/lib/api-auth'

// A full syncAll can outlast the default function timeout when several items
// (and the investment-transaction backfill) are involved.
export const maxDuration = 60

// Daily safety net: Vercel Cron (GET, authenticated by Bearer CRON_SECRET) runs
// a full sync so data still refreshes even if a Plaid webhook is missed.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await syncAll()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('cron sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

// Session-authenticated manual trigger (kept as an in-app/debug escape hatch;
// supports force to reset cursors and re-fetch full transaction history).
export async function POST(req: NextRequest) {
  const authError = await requireAuth()
  if (authError) return authError
  const csrfError = verifySameOrigin(req)
  if (csrfError) return csrfError

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
