import { getCalendarGridCells, getHeatmapStyle } from '@/lib/calendar'

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
