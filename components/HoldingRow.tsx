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
      <td className="py-3 text-right tabular-nums text-[14px] text-[var(--muted-text)]">
        {weight.toFixed(0)}%
      </td>
    </tr>
  )
}
