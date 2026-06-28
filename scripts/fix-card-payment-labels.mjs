// Fix card-payment rows that were stamped with a custom category (e.g. "Amex
// Payment"), which suppresses the automatic credit-card-payment detection.
//
// Targets ONLY rows that are structurally credit-card payments (the same logic
// the app uses) yet carry a non-sentinel custom_category. For those it clears
// custom_category so auto-detection takes over, and deletes any merchant rule
// that would re-stamp them on the next sync.
//
// DRY RUN by default — shows what it WOULD change and writes nothing.
// Add --fix to actually apply. Run against prod:
//
//   TURSO_DATABASE_URL='libsql://finance-prod-...' TURSO_AUTH_TOKEN='...' node scripts/fix-card-payment-labels.mjs
//   TURSO_DATABASE_URL='libsql://finance-prod-...' TURSO_AUTH_TOKEN='...' node scripts/fix-card-payment-labels.mjs --fix

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
if (!url) { console.error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for remote).'); process.exit(1) }
const APPLY = process.argv.includes('--fix')
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
const q = async (s, a = []) => (await c.execute({ sql: s, args: a })).rows

const CARD_PAYMENT_CATEGORY = 'CARD_PAYMENT'
const INFLOW = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
// Structurally a card payment, IGNORING custom_category (so we can find rows a
// label is currently hiding).
const structurallyCardPayment = (t) =>
  t.category_detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' ||
  (t.type === 'credit' && t.amount < 0 && !t.merchant_name && INFLOW.has(t.category))

console.log(`\nDB: ${url.replace(/\?.*/, '')}   mode: ${APPLY ? 'APPLY (--fix)' : 'DRY RUN'}\n`)

const rows = await q(`select t.id, t.amount, t.date, t.merchant_name, t.category, t.category_detailed, t.custom_category, a.type
                      from transactions t left join accounts a on a.id = t.account_id`)

// Mislabeled = structurally a payment, but custom_category is set to something
// other than the reserved marker (that label is suppressing detection).
const mislabeled = rows.filter(t =>
  structurallyCardPayment(t) && t.custom_category && t.custom_category !== CARD_PAYMENT_CATEGORY)

if (mislabeled.length === 0) {
  console.log('No mislabeled card payments found. Nothing to do.')
  process.exit(0)
}

console.log(`Found ${mislabeled.length} card payment(s) hidden behind a custom label:\n`)
for (const t of mislabeled.sort((a, b) => (a.date < b.date ? 1 : -1)))
  console.log(`  ${t.date}  ${String(t.amount).padStart(10)}  label="${t.custom_category}"  ${t.category_detailed}  ${t.merchant_name ?? '(no merchant)'}`)

// Merchant rules that would re-stamp these on the next sync.
const merchants = [...new Set(mislabeled.map(t => t.merchant_name).filter(Boolean))]
const labels = [...new Set(mislabeled.map(t => t.custom_category))]
const staleRules = merchants.length
  ? await q(`select merchant_name, category from category_rules where merchant_name in (${merchants.map(() => '?').join(',')})`, merchants)
  : []
if (staleRules.length) {
  console.log(`\nMerchant rules that re-apply these labels:`)
  for (const r of staleRules) console.log(`  "${r.merchant_name}" -> ${r.category}`)
}

if (!APPLY) {
  console.log(`\nDRY RUN — nothing written. Re-run with --fix to: clear custom_category on the ${mislabeled.length} row(s) above`)
  console.log(`and delete the ${staleRules.length} merchant rule(s). Auto-detection will then treat them as Card payments.`)
  process.exit(0)
}

const ids = mislabeled.map(t => t.id)
await q(`update transactions set custom_category = NULL where id in (${ids.map(() => '?').join(',')})`, ids)
if (merchants.length)
  await q(`delete from category_rules where merchant_name in (${merchants.map(() => '?').join(',')})`, merchants)
console.log(`\n✓ Cleared custom_category on ${ids.length} row(s); deleted ${staleRules.length} merchant rule(s).`)
console.log(`Labels seen and removed: ${labels.join(', ')}`)
console.log(`They will now auto-detect as Card payments and drop out of spend.`)
process.exit(0)
