// Accrual amortization: spread a single posting's amount evenly across the N
// months it economically covers, starting its posting month (forward, inclusive).
// This is an analytics-only transform — the raw transaction is never altered, and
// it is applied ONLY on accrual surfaces (trends, savings rate, budget), never on
// cash surfaces (the "Spent"/"Income" cards, balances), so it can't create a
// phantom balance in a month no money actually moved.
//
// Single source of truth for the math, mirroring the "one shared rule" principle
// behind spendInclusion() in lib/db/queries.ts.

export type YearMonth = { year: number; month: number }

export type AmortizableTx = {
  date: string // 'YYYY-MM-DD'
  amount: number
  spreadMonths: number | null
}

export type Slice = { year: number; month: number; amount: number }

// Months since epoch (year*12 + (month-1)) — a monotonic index for arithmetic and
// comparison that's immune to year boundaries.
function ymIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

function fromIndex(idx: number): YearMonth {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

// Even split with exact reconstruction: distribute in whole cents and let the last
// slice absorb the rounding remainder so Σ slices === amount (no penny drift over
// N months). Returns one entry per slice index 0..n-1.
function evenSlices(amount: number, n: number): number[] {
  if (n <= 1) return [amount]
  const totalCents = Math.round(amount * 100)
  const baseCents = Math.trunc(totalCents / n)
  const out: number[] = []
  let assigned = 0
  for (let i = 0; i < n; i++) {
    const cents = i === n - 1 ? totalCents - assigned : baseCents
    assigned += cents
    out.push(cents / 100)
  }
  return out
}

// Expand one transaction into per-(year,month) slices that intersect the inclusive
// [rangeStart, rangeEnd] window. A tx older than the window still contributes to
// in-range months its spread reaches; slices outside the window are clipped.
// spreadMonths null/<=1 → a single slice in the posting month (passthrough).
export function expandAmortized(
  tx: AmortizableTx,
  rangeStart: YearMonth,
  rangeEnd: YearMonth,
): Slice[] {
  const year = Number(tx.date.slice(0, 4))
  const month = Number(tx.date.slice(5, 7))
  const n = tx.spreadMonths && tx.spreadMonths > 1 ? Math.floor(tx.spreadMonths) : 1

  const startIdx = ymIndex(year, month)
  const sliceAmounts = evenSlices(tx.amount, n)

  const lo = ymIndex(rangeStart.year, rangeStart.month)
  const hi = ymIndex(rangeEnd.year, rangeEnd.month)

  const out: Slice[] = []
  for (let i = 0; i < n; i++) {
    const idx = startIdx + i
    if (idx < lo || idx > hi) continue
    const ym = fromIndex(idx)
    out.push({ year: ym.year, month: ym.month, amount: sliceAmounts[i] })
  }
  return out
}
