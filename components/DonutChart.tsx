type Segment = {
  label: string
  value: number
  color: string
}

type Props = {
  segments: Segment[]
  size?: number
}

export function DonutChart({ segments, size = 130 }: Props) {
  const circumference = 2 * Math.PI * 15.9 // ≈ 99.9

  // A negative dashLen creates invalid strokeDasharray — the browser falls back to painting
  // a full opaque circle in that segment's color, covering all other segments.
  const positiveSegments = segments.filter((s) => s.value > 0)
  const total = positiveSegments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  let cumulative = 0
  const arcs = positiveSegments.map((seg) => {
    const dashLen = (seg.value / total) * circumference
    const arc = { ...seg, dashLen, cumulativeLen: cumulative }
    cumulative += dashLen
    return arc
  })

  // Legend shows all segments (including credits) so the user sees the full picture
  const legendTotal = segments.reduce((s, seg) => s + Math.abs(seg.value), 0)

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox="0 0 42 42" style={{ flexShrink: 0 }}>
        {/* Track */}
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f0ede5" strokeWidth="6" />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx="21"
            cy="21"
            r="15.9"
            fill="none"
            stroke={arc.color}
            strokeWidth="6"
            transform="rotate(-90 21 21)"
            strokeDasharray={`${arc.dashLen} ${circumference - arc.dashLen}`}
            strokeDashoffset={circumference - arc.cumulativeLen}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-2.5 flex-1">
        {segments.map((seg) => {
          const pct = legendTotal > 0 ? ((Math.abs(seg.value) / legendTotal) * 100).toFixed(0) : '0'
          return (
            <div key={seg.label} className="flex items-center justify-between text-[13.5px]">
              <span className="flex items-center gap-2 text-[var(--muted-text)]">
                <span
                  className="w-[11px] h-[11px] rounded-[3px] shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.label}
              </span>
              <span className="font-semibold tabular-nums text-[var(--ink)]">
                {seg.value < 0 ? '-' : ''}{pct}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
