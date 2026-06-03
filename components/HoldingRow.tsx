import { formatCAD } from '@/lib/format'

type Holding = {
  id: string
  securityName: string
  tickerSymbol: string | null
  institutionValue: number
  costBasis: number | null
}

type Props = {
  holding: Holding
  totalPortfolioValue: number
}

export function HoldingRow({ holding, totalPortfolioValue }: Props) {
  const weight = totalPortfolioValue > 0 ? (holding.institutionValue / totalPortfolioValue) * 100 : 0
  const gain = holding.costBasis != null && holding.costBasis > 0
    ? holding.institutionValue - holding.costBasis
    : null
  const gainPct = gain != null && holding.costBasis! > 0
    ? (gain / holding.costBasis!) * 100
    : null
  const gainPositive = gain !== null && gain >= 0

  return (
    <tr className="border-b border-[var(--hairline)] last:border-0">
      <td className="py-3 text-[14px]">
        <span className="font-bold text-[var(--ink)]">{holding.tickerSymbol ?? '—'}</span>
        {' '}
        <span className="text-[var(--muted-text)] text-[13px]">{holding.securityName}</span>
      </td>
      <td className="py-3 text-right tabular-nums text-[14px] font-medium text-[var(--ink)]">
        {formatCAD(holding.institutionValue)}
      </td>
      <td className="py-3 text-right tabular-nums text-[14px]">
        {gain !== null ? (
          <span className={gainPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
            {gain >= 0 ? '+' : ''}{formatCAD(gain)}
            {gainPct !== null && (
              <span className="ml-1 text-[12px] opacity-75">
                ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(1)}%)
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--faint)]">—</span>
        )}
      </td>
      <td className="py-3 text-right tabular-nums text-[14px] text-[var(--muted-text)]">
        {weight.toFixed(0)}%
      </td>
    </tr>
  )
}
