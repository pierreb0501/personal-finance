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
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return null

  // Build SVG strokes: each segment is a stroke-dasharray on a circle
  // Using same approach as mockup: 42×42 viewBox, r=15.9, stroke-width=6
  const circumference = 2 * Math.PI * 15.9 // ≈ 99.9
  let offset = 25 // start at top (25 = circumference/4)

  const arcs = segments.map((seg) => {
    const pct = seg.value / total
    const dashLen = pct * circumference
    const arc = { ...seg, dashLen, dashGap: circumference - dashLen, offset }
    offset -= dashLen
    return arc
  })

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
            strokeDasharray={`${arc.dashLen} ${arc.dashGap}`}
            strokeDashoffset={arc.offset}
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
        ))}
      </svg>

      {/* Legend */}
      <div className="flex flex-col gap-2.5 flex-1">
        {segments.map((seg) => {
          const pct = total > 0 ? ((seg.value / total) * 100).toFixed(0) : '0'
          return (
            <div key={seg.label} className="flex items-center justify-between text-[13.5px]">
              <span className="flex items-center gap-2 text-[var(--muted-text)]">
                <span
                  className="w-[11px] h-[11px] rounded-[3px] shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                {seg.label}
              </span>
              <span className="font-semibold tabular-nums text-[var(--ink)]">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
