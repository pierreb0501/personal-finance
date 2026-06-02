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
  const balance = liability ? -Math.abs(account.balanceCurrent) : account.balanceCurrent
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
          liability ? 'text-[var(--negative)]' : 'text-[var(--ink)]',
        ].join(' ')}
      >
        {liability ? '-' : ''}{formatCAD(Math.abs(balance))}
      </p>
    </div>
  )
}
