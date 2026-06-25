type Segment = {
  category: string
  label: string
  color: string
  actualAmount: number
  plannedAmount: number
}

type Props = {
  segments: Segment[]
}

export function CategoryAllocationChart({ segments }: Props) {
  const totalActual = segments.reduce((s, seg) => s + seg.actualAmount, 0)
  const totalPlanned = segments.reduce((s, seg) => s + seg.plannedAmount, 0)
  if (totalActual === 0 && totalPlanned === 0) return null

  const sorted = [...segments].sort((a, b) => b.actualAmount - a.actualAmount)

  const circumference = 2 * Math.PI * 15.9

  function buildArcs(segs: typeof sorted, getAmount: (s: typeof sorted[0]) => number, total: number) {
    let cum = 0
    return segs.filter((s) => getAmount(s) > 0).map((seg) => {
      const dashLen = total > 0 ? (getAmount(seg) / total) * circumference : 0
      const arc = { ...seg, dashLen, cumulativeLen: cum }
      cum += dashLen
      return arc
    })
  }

  const actualArcs = buildArcs(sorted, (s) => s.actualAmount, totalActual)
  const plannedArcs = buildArcs(sorted, (s) => s.plannedAmount, totalPlanned)

  function Donut({ arcs, label }: { arcs: typeof actualArcs; label: string }) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <svg width={180} height={180} viewBox="0 0 42 42">
          <circle cx="21" cy="21" r="15.9" fill="none" stroke="#f0ede5" strokeWidth="6" />
          {arcs.map((arc, i) => (
            <circle
              key={i}
              cx="21" cy="21" r="15.9"
              fill="none"
              stroke={arc.color}
              strokeWidth="6"
              transform="rotate(-90 21 21)"
              strokeDasharray={`${arc.dashLen} ${circumference - arc.dashLen}`}
              strokeDashoffset={circumference - arc.cumulativeLen}
            />
          ))}
        </svg>
        <p className="text-[11px] text-[var(--faint)]">{label}</p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-6">
      {/* Two donuts stacked — actual on top, planned below */}
      <div className="shrink-0 flex flex-col gap-4">
        <Donut arcs={actualArcs} label="actual" />
        <Donut arcs={plannedArcs} label="planned" />
      </div>

      {/* Legend with planned % vs actual % */}
      <div className="flex flex-col flex-1 mt-1">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] mb-3">
          <span>Category</span>
          <div className="flex gap-5">
            <span>planned</span>
            <span className="w-8 text-right">actual</span>
          </div>
        </div>
        <div className="space-y-2.5">
          {sorted.map((seg) => {
            const plannedPct = totalPlanned > 0 ? (seg.plannedAmount / totalPlanned) * 100 : null
            const actualPct = totalActual > 0 ? (seg.actualAmount / totalActual) * 100 : null
            return (
              <div key={seg.category} className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 text-[var(--muted-text)]">
                  <span
                    className="w-[10px] h-[10px] rounded-[3px] shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  {seg.label}
                </span>
                <div className="flex gap-5 tabular-nums">
                  <span className="text-[var(--faint)] w-8 text-right">
                    {plannedPct !== null && plannedPct > 0 ? `${plannedPct.toFixed(0)}%` : '—'}
                  </span>
                  <span className={[
                    'font-semibold w-8 text-right',
                    actualPct !== null && actualPct > 0 ? 'text-[var(--ink)]' : 'text-[var(--faint)]',
                  ].join(' ')}>
                    {actualPct !== null && actualPct > 0 ? `${actualPct.toFixed(0)}%` : '—'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
