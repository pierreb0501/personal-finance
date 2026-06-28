// Read-only diagnostic: why are credit-card payments not being detected?
// Replicates the app's exact isCardPayment logic against whatever DB the env
// points at. Run against PROD with prod TURSO_* creds:
//
//   TURSO_DATABASE_URL='libsql://finance-prod-...' TURSO_AUTH_TOKEN='...' node scripts/diagnose-card-payments.mjs
//
// (Get the prod values from Vercel → Project → Settings → Environment Variables,
//  or your password manager. Nothing is written or sent anywhere.)

import { createClient } from '@libsql/client'

const url = process.env.TURSO_DATABASE_URL
if (!url) { console.error('Set TURSO_DATABASE_URL (and TURSO_AUTH_TOKEN for remote).'); process.exit(1) }
const c = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
const q = async (s, a = []) => (await c.execute({ sql: s, args: a })).rows
const isRemote = url.startsWith('libsql://') || url.startsWith('https://')

const CARD_PAYMENT_CATEGORY = 'CARD_PAYMENT'
const INFLOW = new Set(['INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])
const isCardPayment = (t) => {
  if (t.custom_category === CARD_PAYMENT_CATEGORY) return true
  if (t.custom_category) return false
  if (t.category_detailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT') return true
  return t.type === 'credit' && t.amount < 0 && !t.merchant_name && INFLOW.has(t.category)
}

console.log(`\nDB: ${isRemote ? url.replace(/\?.*/, '') : url}\n`)

// 1. Schema sanity — does the column the SQL detection needs even exist?
const cols = (await q('PRAGMA table_info(transactions)')).map(r => r.name)
console.log('transactions has custom_category column:', cols.includes('custom_category'))
console.log('transactions has category_detailed column:', cols.includes('category_detailed'))

// 2. Accounts by type — inflow detection needs type='credit'
console.log('\naccounts by type:', (await q('select type, count(*) n from accounts group by type')).map(r => `${r.type}:${r.n}`).join('  '))

// 3. What detailed categories show up on credit accounts? (catches Plaid taxonomy drift)
console.log('\ncategory_detailed values seen on credit-type accounts:')
for (const r of await q(`select t.category_detailed, count(*) n from transactions t join accounts a on a.id=t.account_id where a.type='credit' group by t.category_detailed order by n desc limit 15`))
  console.log(`  ${String(r.n).padStart(4)}  ${r.category_detailed}`)

// 4. The literal the outflow detection keys on
console.log('\noutflow legs (category_detailed = LOAN_PAYMENTS_CREDIT_CARD_PAYMENT):',
  (await q(`select count(*) n from transactions where category_detailed='LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'`))[0].n)

// 5. Run the FULL detection over all transactions, joined like the spending page does
const all = await q(`select t.id, t.amount, t.date, t.merchant_name, t.category, t.category_detailed, t.custom_category, a.type
                     from transactions t left join accounts a on a.id = t.account_id`)
const detected = all.filter(isCardPayment)
console.log(`\ntotal transactions: ${all.length}`)
console.log(`detected as card payments (full logic): ${detected.length}`)
console.log('\nmost recent detected card payments:')
for (const t of detected.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10))
  console.log(`  ${t.date}  ${String(t.amount).padStart(10)}  type=${t.type}  ${t.category_detailed}  ${t.merchant_name ?? '(no merchant)'}`)

if (detected.length === 0) console.log('\n>>> Nothing detected. The category_detailed list in step 3 shows what Plaid actually tagged these payments — the detection literal may not match.')
process.exit(0)
