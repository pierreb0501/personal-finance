import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { items, accounts, transactions } from '@/lib/db/schema'
import { applyAllCategoryRules } from '@/lib/db/queries'
import { revalidatePath } from 'next/cache'
import { MANUAL_IMPORT_ITEM_ID as MANUAL_ITEM_ID, AMEX_CSV_ACCOUNT_ID as AMEX_ACCOUNT_ID } from '@/lib/constants'

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

async function ensureAmexAccount() {
  await db.insert(items).values({
    id: MANUAL_ITEM_ID,
    plaidItemId: MANUAL_ITEM_ID,
    accessToken: 'manual',
    institutionName: 'Manual Import',
    createdAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing().run()

  await db.insert(accounts).values({
    id: AMEX_ACCOUNT_ID,
    itemId: MANUAL_ITEM_ID,
    plaidAccountId: AMEX_ACCOUNT_ID,
    name: 'American Express (CSV)',
    type: 'credit',
    subtype: 'credit card',
    balanceCurrent: 0,
    balanceAvailable: null,
    isoCurrencyCode: 'CAD',
    updatedAt: Math.floor(Date.now() / 1000),
  }).onConflictDoNothing().run()
}

// RFC 4180 compliant — handles quoted fields with embedded newlines and commas
function parseRfc4180(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
      } else if (ch === '"') {
        inQuotes = false
        i++
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        row.push(field.trim())
        field = ''
        i++
      } else if (ch === '\r' && text[i + 1] === '\n') {
        row.push(field.trim())
        field = ''
        rows.push(row)
        row = []
        i += 2
      } else if (ch === '\n') {
        row.push(field.trim())
        field = ''
        rows.push(row)
        row = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }
  if (field || row.length > 0) {
    row.push(field.trim())
    rows.push(row)
  }

  return rows.filter(r => r.some(f => f))
}

function parseDate(raw: string): string | null {
  // "10 Jun 2026" — Amex Canada format
  const monthName = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (monthName) {
    const [, day, mon, year] = monthName
    const month = MONTH_MAP[mon.toLowerCase()]
    if (month) return `${year}-${month}-${day.padStart(2, '0')}`
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  // MM/DD/YYYY or DD/MM/YYYY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, a, b, year] = slash
    if (parseInt(a) > 12) return `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`
    return `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`
  }
  return null
}

type AmexRow = { date: string; description: string; amount: number; id: string }

function parseAmexCsv(text: string): AmexRow[] {
  const rows = parseRfc4180(text)
  if (rows.length < 2) throw new Error('CSV appears empty')

  const header = rows[0].map(h => h.toLowerCase())
  const dateIdx = header.findIndex(h => h === 'date')
  const descIdx = header.findIndex(h => h === 'description')
  const amountIdx = header.findIndex(h => h === 'amount')
  const refIdx = header.findIndex(h => h === 'reference')

  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error(`Could not find required columns. Got: ${header.join(', ')}`)
  }

  const results: AmexRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i]
    const rawDate = cols[dateIdx]
    const rawAmount = cols[amountIdx]
    const description = (cols[descIdx] ?? '').trim()
    const reference = refIdx !== -1 ? cols[refIdx].replace(/^'|'$/g, '') : ''

    if (!rawDate || !rawAmount) continue
    if (description.toLowerCase().includes('payment received')) continue

    const date = parseDate(rawDate)
    if (!date) continue

    const amount = parseFloat(rawAmount.replace(/[$,\s]/g, ''))
    if (isNaN(amount)) continue

    // Use Amex reference as ID when available — guaranteed unique per transaction
    const id = reference
      ? `amex_${reference}`
      : `amex_${date}_${description.replace(/\s+/g, '_')}_${amount}`

    results.push({ date, description, amount, id })
  }

  return results
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const text = await file.text()
    const rows = parseAmexCsv(text)
    if (rows.length === 0) return NextResponse.json({ error: 'No transactions found in CSV' }, { status: 400 })

    await ensureAmexAccount()

    let imported = 0
    let skipped = 0

    for (const row of rows) {
      const result = await db.insert(transactions).values({
        id: row.id,
        accountId: AMEX_ACCOUNT_ID,
        amount: row.amount,
        date: row.date,
        merchantName: row.description,
        rawName: row.description,
        category: 'OTHER',
        categoryDetailed: 'OTHER_OTHER',
        pending: 0,
      }).onConflictDoNothing().run()

      if (result.rowsAffected > 0) imported++
      else skipped++
    }

    await applyAllCategoryRules(db)
    revalidatePath('/')
    revalidatePath('/spending')
    revalidatePath('/budget')

    return NextResponse.json({ imported, skipped, total: rows.length })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
