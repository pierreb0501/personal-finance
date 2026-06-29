// Backfill merchant_name for existing transactions that have none, by normalizing
// the raw bank descriptor (raw_name). New syncs already do this in lib/sync.ts; this
// catches rows that landed before that change. After this runs, those rows get a
// readable name and become eligible for "apply to all <merchant>" category rules.
//
// The normalizer below is a faithful copy of lib/normalize.ts (source of truth —
// keep in sync). DRY RUN by default; add --fix to write. Run against prod:
//
//   TURSO_DATABASE_URL='libsql://finance-prod-...' TURSO_AUTH_TOKEN='...' node scripts/backfill-merchant-names.mjs
//   TURSO_DATABASE_URL='libsql://finance-prod-...' TURSO_AUTH_TOKEN='...' node scripts/backfill-merchant-names.mjs --fix

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
if (!url) { console.error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for remote).'); process.exit(1) }
const APPLY = process.argv.includes('--fix')
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
const q = async (s, a = []) => (await c.execute({ sql: s, args: a })).rows

// ── normalizer (mirror of lib/normalize.ts) ──────────────────────────────────
const PROCESSOR_PREFIX =
  /^(?:SQ|SQU|TST|TQ|PP|PAYPAL|GOOGLE|GOOG|STRIPE|SP|IC|CKO|WPY|EBAY|AMZN MKTP|AMAZON)\s*\*+\s*/i
const CA_PROVINCES = 'AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT'
const TRAILING_PROVINCE = new RegExp(`\\s+(?:${CA_PROVINCES})(?:\\s+(?:CA|CAN|USA|US))?\\s*$`, 'i')
const toTitleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase())

function normalizeMerchantName(raw) {
  if (!raw) return null
  const original = String(raw).trim()
  if (!original) return null
  let s = original
  s = s.replace(PROCESSOR_PREFIX, '')
  s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
  s = s.replace(/\.(?:com|ca|net|org|co|io)\b/gi, ' ')
  s = s.replace(/\*+\s*[A-Za-z0-9]*\d[A-Za-z0-9]*/g, ' ')
  s = s.replace(TRAILING_PROVINCE, ' ')
  s = s.replace(/\bstore\s*#?\s*\d+/gi, ' ')
  s = s.replace(/#\s*\d+/g, ' ')
  s = s.replace(/\b\d{3,}\b/g, ' ')
  s = s.replace(/[*#]+/g, ' ')
  s = s.replace(/\s{2,}/g, ' ').trim()
  if (!s) return toTitleCase(original)
  return toTitleCase(s)
}
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\nDB: ${url.replace(/\?.*/, '')}   mode: ${APPLY ? 'APPLY (--fix)' : 'DRY RUN'}\n`)

// Skip only the rows the card-payment heuristic relies on staying nameless: a
// merchantless inflow (amount < 0) on a CREDIT account in a payment-ish category
// (see isCardPayment in lib/db/queries.ts). Everything else — spend, store refunds,
// bank-account income — is safe to name.
const CARD_PAYMENT_INFLOW_CATEGORIES = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
const rows = await q(
  `select t.id, t.raw_name, t.amount, t.category, a.type as account_type
   from transactions t left join accounts a on a.id = t.account_id
   where t.merchant_name is null and t.raw_name is not null and trim(t.raw_name) <> ''`,
)

const updates = rows
  .filter((r) => !(
    r.account_type === 'credit' &&
    r.amount < 0 &&
    CARD_PAYMENT_INFLOW_CATEGORIES.has(r.category)
  ))
  .map((r) => ({ id: r.id, raw: r.raw_name, name: normalizeMerchantName(r.raw_name) }))
  .filter((u) => u.name)

console.log(`${rows.length} row(s) with no merchant_name; ${updates.length} will be named.\n`)
for (const u of updates.slice(0, 30)) {
  console.log(`  ${JSON.stringify(u.raw)}  ->  ${JSON.stringify(u.name)}`)
}
if (updates.length > 30) console.log(`  … and ${updates.length - 30} more`)

if (APPLY && updates.length > 0) {
  for (const u of updates) {
    await q(`update transactions set merchant_name = ? where id = ?`, [u.name, u.id])
  }
  console.log(`\nUpdated ${updates.length} row(s).`)
} else if (!APPLY) {
  console.log(`\nDry run — nothing written. Re-run with --fix to apply.`)
}
