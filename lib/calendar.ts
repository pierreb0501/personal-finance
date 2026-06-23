// Pure layout/color helpers for the /calendar page — no DB access, no React.
// Kept framework-free so they're cheap to unit test.

const POSITIVE_RGB: [number, number, number] = [46, 125, 91]  // --positive, #2E7D5B
const NEGATIVE_RGB: [number, number, number] = [181, 80, 60]  // --negative, #B5503C

const MIN_ALPHA = 0.18
const MAX_ALPHA = 0.9
const WHITE_TEXT_THRESHOLD = 0.45

export type HeatmapStyle = {
  background: string
  textColor: string
}

/**
 * Maps a day's net cash flow to a trading-journal-style fill: deeper color
 * for bigger swings relative to the month, scaled between MIN_ALPHA (barely
 * tinted) and MAX_ALPHA (fully saturated). $0 days are left transparent so
 * they read as "no activity" rather than "tiny loss".
 */
export function getHeatmapStyle(netTotal: number, maxAbsNetTotal: number): HeatmapStyle {
  if (netTotal === 0) {
    return { background: 'transparent', textColor: 'var(--faint)' }
  }

  const ratio = maxAbsNetTotal > 0 ? Math.min(Math.abs(netTotal) / maxAbsNetTotal, 1) : 0
  const alpha = MIN_ALPHA + ratio * (MAX_ALPHA - MIN_ALPHA)
  const [r, g, b] = netTotal > 0 ? POSITIVE_RGB : NEGATIVE_RGB

  return {
    background: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})`,
    textColor: alpha > WHITE_TEXT_THRESHOLD ? '#FFFFFF' : (netTotal > 0 ? '#2E7D5B' : '#B5503C'),
  }
}

/**
 * Builds a Sun-Sat month grid as a flat array (length always a multiple of
 * 7): null for leading/trailing blanks, 'YYYY-MM-DD' for each real day.
 */
export function getCalendarGridCells(year: number, month: number): (string | null)[] {
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0 = Sun .. 6 = Sat

  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}
