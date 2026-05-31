import { NextResponse } from 'next/server'
import { syncAll } from '@/lib/sync'

export async function POST() {
  try {
    await syncAll()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
