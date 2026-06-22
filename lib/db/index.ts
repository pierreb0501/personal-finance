import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import path from 'path'
import * as schema from './schema'

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>

let instance: DrizzleDb | null = null

// Lazily creates the Turso client and runs migrations on first actual query,
// instead of as a side effect of importing this module. Several modules
// (e.g. lib/sync.ts) import `db` only to use as a default parameter value
// that tests override with an in-memory database — without this, merely
// importing those modules required live TURSO_* credentials and opened a
// connection to the production database.
function getInstance(): DrizzleDb {
  if (!instance) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    instance = drizzle(client, { schema })
    migrate(instance, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  }
  return instance
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getInstance() as object, prop, receiver)
  },
})

export type DB = DrizzleDb
