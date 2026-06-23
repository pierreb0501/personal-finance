import { getCalendarGridCells, getHeatmapStyle } from '@/lib/calendar'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'path'
import * as schema from '@/lib/db/schema'
import type { DB } from '@/lib/db'
import { getCalendarMonth, addCommittedItem, addManualRecurring } from '@/lib/db/queries'

describe('getCalendarGridCells', () => {
  it('returns a length that is a multiple of 7', () => {
    const cells = getCalendarGridCells(2026, 6)
    expect(cells.length % 7).toBe(0)
  })

  it('pads leading cells to align the 1st with its real weekday', () => {
    const year = 2026
    const month = 6
    const expectedLeadingBlanks = new Date(year, month - 1, 1).getDay()
    const cells = getCalendarGridCells(year, month)
    const firstNonNullIndex = cells.findIndex((c) => c !== null)
    expect(firstNonNullIndex).toBe(expectedLeadingBlanks)
  })

  it('includes every day of the month exactly once, in order', () => {
    const year = 2026
    const month = 6
    const daysInMonth = new Date(year, month, 0).getDate()
    const cells = getCalendarGridCells(year, month)
    const dates = cells.filter((c): c is string => c !== null)
    expect(dates).toHaveLength(daysInMonth)
    expect(dates[0]).toBe(`${year}-06-01`)
    expect(dates[dates.length - 1]).toBe(`${year}-06-${String(daysInMonth).padStart(2, '0')}`)
  })

  it('handles February in a leap year', () => {
    const cells = getCalendarGridCells(2028, 2)
    const dates = cells.filter((c): c is string => c !== null)
    expect(dates).toHaveLength(29)
  })
})

describe('getHeatmapStyle', () => {
  it('returns a neutral, transparent style for a $0 net day', () => {
    const style = getHeatmapStyle(0, 500)
    expect(style.background).toBe('transparent')
  })

  it('returns full-intensity green for the month\'s biggest gain day', () => {
    const style = getHeatmapStyle(100, 100)
    expect(style.background).toBe('rgba(46, 125, 91, 0.90)')
    expect(style.textColor).toBe('#FFFFFF')
  })

  it('returns a lighter, non-white-text red for a small loss relative to the month', () => {
    const style = getHeatmapStyle(-50, 200)
    expect(style.background).toBe('rgba(181, 80, 60, 0.36)')
    expect(style.textColor).toBe('#B5503C')
  })

  it('treats a lone active day in the month as full intensity', () => {
    const style = getHeatmapStyle(-75, 75)
    expect(style.background).toBe('rgba(181, 80, 60, 0.90)')
  })
})

function createTestDb(): DB {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'lib/db/migrations') })
  return db as unknown as DB
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function seedAccount(db: DB) {
  const itemId = 'item-1'
  const accountId = 'acc-1'
  db.insert(schema.items).values({ id: itemId, plaidItemId: 'pi-1', accessToken: 'tok', institutionName: 'TD', createdAt: now() }).run()
  db.insert(schema.accounts).values({ id: accountId, itemId, plaidAccountId: 'pa-1', name: 'Chequing', type: 'depository', subtype: 'chequing', balanceCurrent: 5000, isoCurrencyCode: 'CAD', updatedAt: now() }).run()
  return accountId
}

describe('getCalendarMonth', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
  })

  it('builds one entry per day of the month with zeroed totals when there is no data', async () => {
    const result = await getCalendarMonth(db, 2026, 4) // April = 30 days
    expect(result.days).toHaveLength(30)
    expect(result.days.every((d) => d.netTotal === 0 && d.actual.length === 0)).toBe(true)
    expect(result.maxAbsNetTotal).toBe(0)
  })

  it('computes net total as income minus spend and buckets transactions by date', async () => {
    const accountId = seedAccount(db)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: '2026-04-05', merchantName: 'Metro', category: 'GROCERIES', categoryDetailed: 'GROCERIES_SUPERMARKETS', pending: 0 },
      { id: 't2', accountId, amount: -1000, date: '2026-04-05', merchantName: 'Employer', category: 'INCOME', categoryDetailed: 'INCOME_WAGES', pending: 0 },
    ]).run()

    const result = await getCalendarMonth(db, 2026, 4)
    const day5 = result.days.find((d) => d.date === '2026-04-05')!
    expect(day5.netTotal).toBe(950) // 1000 income - 50 spend
    expect(day5.actual).toHaveLength(2)
    expect(result.maxAbsNetTotal).toBe(950)
  })

  it('excludes ignored transactions from totals and actual entries', async () => {
    const accountId = seedAccount(db)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 50, date: '2026-04-05', merchantName: 'Metro', category: 'GROCERIES', categoryDetailed: 'GROCERIES_SUPERMARKETS', pending: 0, ignored: 1 },
    ]).run()

    const result = await getCalendarMonth(db, 2026, 4)
    const day5 = result.days.find((d) => d.date === '2026-04-05')!
    expect(day5.netTotal).toBe(0)
    expect(day5.actual).toHaveLength(0)
  })

  it('projects an unconfirmed committed item onto its expected day, clamped to the last day of a short month', async () => {
    const year = futureYear()
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 31)

    const result = await getCalendarMonth(db, year, 4) // April has 30 days
    const lastDay = result.days.find((d) => d.date === `${year}-04-30`)!
    expect(lastDay.expected).toHaveLength(1)
    expect(lastDay.expected[0]).toMatchObject({ name: 'Rent', amount: 1500, type: 'expense', source: 'committed' })
  })

  it('drops an expected entry once it has a confirmed match, since it already shows up as an actual transaction', async () => {
    const accountId = seedAccount(db)
    const year = futureYear()
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 1)
    db.insert(schema.transactions).values([
      { id: 't1', accountId, amount: 1500, date: `${year}-04-01`, merchantName: 'Landlord', category: 'RENT_AND_UTILITIES', categoryDetailed: 'RENT_AND_UTILITIES_RENT', pending: 0 },
    ]).run()

    const result = await getCalendarMonth(db, year, 4)
    const day1 = result.days.find((d) => d.date === `${year}-04-01`)!
    expect(day1.expected).toHaveLength(0)
    expect(day1.actual).toHaveLength(1)
  })

  it('projects an unconfirmed manual recurring merchant onto its day-of-month', async () => {
    const year = futureYear()
    await addManualRecurring(db, 'Netflix', 15, 16.99, 'ENTERTAINMENT')

    const result = await getCalendarMonth(db, year, 4)
    const day15 = result.days.find((d) => d.date === `${year}-04-15`)!
    expect(day15.expected).toHaveLength(1)
    expect(day15.expected[0]).toMatchObject({ name: 'Netflix', amount: 16.99, type: 'expense', source: 'recurring' })
  })

  it('never shows expected entries for days already in the past', async () => {
    // A committed item expected on day 1 of the *current* month, viewed
    // partway through the month, should not be forecast for day 1 if today
    // has already passed it — exercised by pointing the expected day at
    // yesterday relative to "now" inside a month that started in the past.
    const now = new Date()
    if (now.getDate() === 1) return // can't simulate "yesterday" on the 1st; skip this edge day
    await addCommittedItem(db, 'Rent', 'expense', 1500, 'RENT_AND_UTILITIES', 1)

    const result = await getCalendarMonth(db, now.getFullYear(), now.getMonth() + 1)
    const day1 = result.days.find((d) => d.date.endsWith('-01'))!
    expect(day1.expected).toHaveLength(0)
  })
})

function futureYear(): number {
  return new Date().getFullYear() + 1
}
