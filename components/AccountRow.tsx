import { formatCAD } from '@/lib/format'

type Account = {
  id: string
  name: string
  type: string
  subtype: string
  balanceCurrent: number
}

function isLiability(type: string) {
  return type === 'credit' || type === 'loan'
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function AccountRow({ account }: { account: Account }) {
  const liability = isLiability(account.type)
  // Signed contribution to net worth. Liabilities subtract (you owe), so a
  // positive credit-card balance is shown as a negative. But a *negative*
  // credit-card balance means the card is in credit (overpaid / refund), which
  // adds to net worth — show it as a positive in green, matching the snapshot.
  const balance = liability ? -account.balanceCurrent : account.balanceCurrent
  const negative = balance < 0
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0">
      <div className="flex items-center gap-3">
        <span className="w-[34px] h-[34px] rounded-[9px] bg-[#f0ede5] flex items-center justify-center text-[13px] font-bold text-[var(--muted-text)] shrink-0">
          {initials(account.name)}
        </span>
        <div>
          <p className="text-[14px] font-semibold text-[var(--ink)] leading-tight">{account.name}</p>
          <p className="text-[12px] text-[var(--faint)] capitalize">{account.subtype.replace(/_/g, ' ')}</p>
        </div>
      </div>
      <p
        className={[
          'text-[14px] font-semibold tabular-nums',
          negative ? 'text-[var(--negative)]' : liability ? 'text-[var(--positive)]' : 'text-[var(--ink)]',
        ].join(' ')}
      >
        {negative ? '-' : ''}{formatCAD(Math.abs(balance))}
      </p>
    </div>
  )
}
