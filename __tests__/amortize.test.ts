import { expandAmortized } from '@/lib/amortize'

const wide = { start: { year: 2000, month: 1 }, end: { year: 2100, month: 12 } }

describe('expandAmortized', () => {
  it('N=1 / null / 0: single slice in the posting month (passthrough)', () => {
    for (const spreadMonths of [null, 1, 0]) {
      const s = expandAmortized({ date: '2026-03-15', amount: 600, spreadMonths }, wide.start, wide.end)
      expect(s).toEqual([{ year: 2026, month: 3, amount: 600 }])
    }
  })

  it('even division spreads forward and inclusive from the posting month', () => {
    const s = expandAmortized({ date: '2026-03-04', amount: 600, spreadMonths: 6 }, wide.start, wide.end)
    expect(s).toEqual([
      { year: 2026, month: 3, amount: 100 },
      { year: 2026, month: 4, amount: 100 },
      { year: 2026, month: 5, amount: 100 },
      { year: 2026, month: 6, amount: 100 },
      { year: 2026, month: 7, amount: 100 },
      { year: 2026, month: 8, amount: 100 },
    ])
  })

  it('crosses a year boundary correctly', () => {
    const s = expandAmortized({ date: '2026-11-01', amount: 300, spreadMonths: 3 }, wide.start, wide.end)
    expect(s.map((x) => [x.year, x.month])).toEqual([[2026, 11], [2026, 12], [2027, 1]])
  })

  it('remainder lands on the last slice so slices sum to the exact amount', () => {
    const s = expandAmortized({ date: '2026-01-01', amount: 100, spreadMonths: 3 }, wide.start, wide.end)
    expect(s.map((x) => x.amount)).toEqual([33.33, 33.33, 33.34])
    const sum = s.reduce((a, b) => a + b.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(100)
  })

  it('is sign-agnostic (income stored negative)', () => {
    const s = expandAmortized({ date: '2026-03-01', amount: -15000, spreadMonths: 6 }, wide.start, wide.end)
    expect(s.every((x) => x.amount === -2500)).toBe(true)
    expect(s).toHaveLength(6)
  })

  it('clips slices outside the window but keeps in-range ones from an older tx', () => {
    // $6000 over 12 months from Jan 2026; window is Jul–Dec 2026.
    const s = expandAmortized(
      { date: '2026-01-10', amount: 6000, spreadMonths: 12 },
      { year: 2026, month: 7 },
      { year: 2026, month: 12 },
    )
    expect(s.map((x) => x.month)).toEqual([7, 8, 9, 10, 11, 12])
    expect(s.every((x) => x.amount === 500)).toBe(true)
  })

  it('returns nothing when the spread never reaches the window', () => {
    const s = expandAmortized(
      { date: '2026-01-01', amount: 600, spreadMonths: 3 }, // Jan–Mar
      { year: 2026, month: 6 },
      { year: 2026, month: 12 },
    )
    expect(s).toEqual([])
  })
})
