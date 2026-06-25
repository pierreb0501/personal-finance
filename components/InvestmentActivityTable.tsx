'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'

type InvestmentTransaction = {
  id: string
  date: string
  type: string
  tickerSymbol: string | null
  securityName: string | null
  quantity: number | null
  price: number | null
  amount: number
}

const TYPE_LABELS: Record<string, string> = {
  buy: 'Buy', sell: 'Sell', dividend: 'Dividend',
  cash: 'Cash', transfer: 'Transfer', fee: 'Fee',
}

const PAGE_SIZE = 5

export function InvestmentActivityTable({ transactions }: { transactions: InvestmentTransaction[] }) {
  const [shown, setShown] = useState(PAGE_SIZE)

  const visible = transactions.slice(0, shown)
  const hasMore = shown < transactions.length

  return (
    <>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Date</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Type</th>
            <th className="text-left text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Security</th>
            <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Qty</th>
            <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Price</th>
            <th className="text-right text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--faint)] pb-3">Amount</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => {
            const label = TYPE_LABELS[t.type.toLowerCase()] ?? t.type
            const isSell = t.type.toLowerCase() === 'sell'
            const isDividend = t.type.toLowerCase() === 'dividend'
            return (
              <tr key={t.id} className="border-t border-[var(--hairline)]">
                <td className="py-2.5 text-[13px] text-[var(--muted-text)] tabular-nums">{t.date}</td>
                <td className="py-2.5 text-[13px]">
                  <span className={[
                    'px-1.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide',
                    isSell ? 'bg-[var(--negative-bg)] text-[var(--negative)]'
                      : isDividend ? 'bg-[var(--positive-bg)] text-[var(--positive)]'
                      : 'bg-[var(--hairline)] text-[var(--muted-text)]',
                  ].join(' ')}>{label}</span>
                </td>
                <td className="py-2.5 text-[13px] text-[var(--ink)]">
                  {t.tickerSymbol
                    ? <><span className="font-semibold">{t.tickerSymbol}</span><span className="text-[var(--muted-text)] ml-1 text-[12px]">{t.securityName}</span></>
                    : <span className="text-[var(--muted-text)]">—</span>}
                </td>
                <td className="py-2.5 text-[13px] text-right tabular-nums text-[var(--muted-text)]">
                  {t.quantity != null ? t.quantity.toFixed(4) : '—'}
                </td>
                <td className="py-2.5 text-[13px] text-right tabular-nums text-[var(--muted-text)]">
                  {t.price != null ? formatCAD(t.price) : '—'}
                </td>
                <td className={[
                  'py-2.5 text-[13px] text-right tabular-nums font-semibold',
                  t.amount < 0 ? 'text-[var(--positive)]' : 'text-[var(--ink)]',
                ].join(' ')}>
                  {t.amount < 0 ? '+' : ''}{formatCAD(Math.abs(t.amount))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {hasMore && (
        <div className="mt-3 pt-3 border-t border-[var(--hairline)]">
          <button
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="text-[13px] text-[var(--accent)] hover:underline cursor-pointer"
          >
            Show more
          </button>
        </div>
      )}
    </>
  )
}
