'use client'

import { useState, useRef, useEffect } from 'react'
import { CalendarRange } from 'lucide-react'
import { setTransactionSpread } from '@/app/actions'

// Per-transaction accrual control: spread this posting's amount over N months on
// the trend charts and budget (cash surfaces are unaffected). Selecting "Don't
// spread" clears it. See lib/amortize.ts.
const OPTIONS = [2, 3, 6, 12]

export function SpreadButton({ txId, spreadMonths }: { txId: string; spreadMonths: number | null }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const active = !!spreadMonths && spreadMonths > 1

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Reset the custom field whenever the menu opens, seeded with the current value
  // if it isn't one of the presets.
  useEffect(() => {
    if (open) setCustom(active && !OPTIONS.includes(spreadMonths!) ? String(spreadMonths) : '')
  }, [open, active, spreadMonths])

  async function choose(months: number) {
    setPending(true)
    setOpen(false)
    await setTransactionSpread(txId, months)
    setPending(false)
  }

  const customN = Math.floor(Number(custom))
  const customValid = custom.trim() !== '' && Number.isFinite(customN) && customN >= 2

  async function applyCustom() {
    if (!customValid) return
    await choose(customN)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title={active ? `Spread over ${spreadMonths} months` : 'Spread over multiple months'}
        className={[
          'p-1.5 rounded-[7px] transition-colors cursor-pointer',
          active
            ? 'text-[var(--accent-dark)] hover:bg-[#e6f1ea]'
            : 'text-[var(--faint)] hover:text-[var(--muted-text)] hover:bg-[#f0ede5]',
        ].join(' ')}
      >
        <CalendarRange size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-[var(--hairline)] rounded-[10px] shadow-lg py-1 min-w-[150px]">
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--faint)]">
            Spread over
          </p>
          {OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => choose(m)}
              className={[
                'w-full text-left px-3 py-1.5 text-[13px] hover:bg-[#f5f2ec] transition-colors',
                spreadMonths === m ? 'font-semibold text-[var(--accent-dark)]' : 'text-[var(--ink)]',
              ].join(' ')}
            >
              {m} months
            </button>
          ))}

          {/* Custom number of months */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--hairline)] mt-1">
            <input
              type="number"
              min={2}
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCustom() }}
              placeholder="Custom"
              className="w-[68px] px-2 py-1 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[7px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
            />
            <span className="text-[12px] text-[var(--muted-text)]">months</span>
            <button
              onClick={applyCustom}
              disabled={!customValid || pending}
              className="ml-auto text-[12px] font-semibold text-[var(--accent-dark)] disabled:text-[var(--faint)] disabled:cursor-not-allowed hover:underline"
            >
              Set
            </button>
          </div>

          {active && (
            <button
              onClick={() => choose(1)}
              className="w-full text-left px-3 py-1.5 text-[13px] text-[var(--muted-text)] hover:bg-[#f5f2ec] transition-colors border-t border-[var(--hairline)] mt-1"
            >
              Don&apos;t spread
            </button>
          )}
        </div>
      )}
    </div>
  )
}
