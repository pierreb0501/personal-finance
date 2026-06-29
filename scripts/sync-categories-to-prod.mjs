// Push user-generated categorization from the local finance-dev.db into prod Turso.
//
// NON-DESTRUCTIVE: matches transactions by Plaid id and updates only the
// custom_category column; upserts the small config tables. Never deletes or
// touches Plaid-synced columns.
//
// Usage:
//   PROD_URL=... PROD_TOKEN=... node scripts/sync-categories-to-prod.mjs --dry-run
//   PROD_URL=... PROD_TOKEN=... node scripts/sync-categories-to-prod.mjs --commit
import { createClient } from '@libsql/client'
import { randomUUID } from 'crypto'

const DRY = !process.argv.includes('--commit')
const LOCAL_URL = process.env.LOCAL_URL || 'file:finance-dev.db'

const local = createClient({ url: LOCAL_URL })
const prod = createClient({ url: process.env.PROD_URL, authToken: process.env.PROD_TOKEN })

const rows = (r) => r.rows

async function main() {
  // --- transactions.custom_category ---
  const localTx = rows(await local.execute(
    "SELECT id, custom_category FROM transactions WHERE custom_category IS NOT NULL AND custom_category != ''"
  ))
  const prodIds = new Set(rows(await prod.execute('SELECT id FROM transactions')).map((r) => r.id))

  const present = localTx.filter((r) => prodIds.has(r.id))
  const missing = localTx.filter((r) => !prodIds.has(r.id))

  console.log(`\n=== transactions.custom_category ===`)
  console.log(`local rows with custom_category : ${localTx.length}`)
  console.log(`  -> exist in prod (will update): ${present.length}`)
  console.log(`  -> NOT in prod (skipped)      : ${missing.length}`)

  // --- config tables to upsert wholesale ---
  // `conflict` is the real unique key to match on (not always the PK), so a
  // partially-categorized prod can't throw a UNIQUE error or duplicate a row.
  // `freshId`: local & prod diverged on the `id` PK after seeding, so when the
  // natural key (name/merchant_name) matches we let prod keep its own id and
  // only inserts get a brand-new uuid — avoids a UNIQUE(id) collision.
  const tableSpecs = [
    { name: 'custom_categories', cols: ['id', 'name', 'color', 'created_at'], conflict: 'name', freshId: true },
    { name: 'category_labels', cols: ['category', 'kind'], conflict: 'category' },
    { name: 'category_rules', cols: ['id', 'merchant_name', 'category', 'created_at'], conflict: 'merchant_name', freshId: true },
    { name: 'category_budgets', cols: ['id', 'category', 'year', 'month', 'planned'], conflict: 'id' },
  ]

  const upserts = []
  for (const spec of tableSpecs) {
    const data = rows(await local.execute(`SELECT ${spec.cols.join(', ')} FROM ${spec.name}`))
    console.log(`\n=== ${spec.name} ===`)
    console.log(`local rows to upsert: ${data.length}`)
    upserts.push({ spec, data })
  }

  if (DRY) {
    console.log(`\n[DRY RUN] No writes performed. Re-run with --commit to apply.`)
    return
  }

  console.log(`\n[COMMIT] Writing to prod...`)
  const stmts = []

  for (const r of present) {
    stmts.push({
      sql: 'UPDATE transactions SET custom_category = ? WHERE id = ?',
      args: [r.custom_category, r.id],
    })
  }

  for (const { spec, data } of upserts) {
    const placeholders = spec.cols.map(() => '?').join(', ')
    // Update everything except the conflict key and the primary key `id`
    // (never rewrite ids that other rows reference).
    const updateCols = spec.cols.filter((c) => c !== spec.conflict && c !== 'id')
    const setClause = updateCols.map((c) => `${c} = excluded.${c}`).join(', ')
    for (const r of data) {
      stmts.push({
        sql: `INSERT INTO ${spec.name} (${spec.cols.join(', ')}) VALUES (${placeholders})
              ON CONFLICT(${spec.conflict}) DO UPDATE SET ${setClause}`,
        // On the INSERT path the id must not collide with a prod row; on the
        // UPDATE path the supplied id is ignored (id is excluded from SET).
        args: spec.cols.map((c) => (c === 'id' && spec.freshId ? randomUUID() : r[c])),
      })
    }
  }

  await prod.batch(stmts, 'write')
  console.log(`Done. ${stmts.length} statements applied.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
