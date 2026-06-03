'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
import { Repeat2, X, Plus, Check } from 'lucide-react'
import { dismissRecurring, addRecurring, removeManualRecurring } from '@/app/actions'

type RecurringMerchant = {
  merchantName: string
  category: string
  avgAmount: number
  monthCount: number
  dayOfMonth: number
  isManual: boolean
}

type Props = {
  merchants: RecurringMerchant[]
  knownCustomCategories: string[]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function DeleteButton({ merchantName, isManual }: { merchantName: string; isManual: boolean }) {
  const [pending, setPending] = useState(false)

  async function handle() {
    setPending(true)
    if (isManual) {
      await removeManualRecurring(merchantName)
    } else {
      await dismissRecurring(merchantName)
    }
    setPending(false)
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      title="Remove from recurring"
      className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer"
    >
      <X size={13} />
    </button>
  )
}

function AddForm({ knownCustomCategories, onDone }: { knownCustomCategories: string[]; onDone: () => void }) {
  const [merchantName, setMerchantName] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('GENERAL_SERVICES')
  const [pending, setPending] = useState(false)

  const allCategories = [
    ...Object.keys(CATEGORY_LABELS),
    ...knownCustomCategories.filter(c => !CATEGORY_LABELS[c]),
  ]

  async function handle() {
    if (!merchantName.trim() || !dayOfMonth || !amount) return
    const day = Math.min(31, Math.max(1, Number(dayOfMonth)))
    const amt = parseFloat(amount)
    if (isNaN(day) || isNaN(amt) || amt <= 0) return
    setPending(true)
    await addRecurring(merchantName, day, amt, category)
    setPending(false)
    onDone()
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-3">Add recurring charge</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={merchantName}
          onChange={(e) => setMerchantName(e.target.value)}
          placeholder="Merchant name"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={dayOfMonth}
          onChange={(e) => setDayOfMonth(e.target.value)}
          placeholder="Day of month (1–31)"
          min={1}
          max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (CAD)"
          min={0}
          step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        >
          {allCategories.map(cat => (
            <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={pending || !merchantName.trim() || !dayOfMonth || !amount}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--ink)] text-white rounded-[8px] hover:opacity-80 disabled:opacity-40 transition-opacity cursor-pointer"
        >
          <Check size={12} />
          {pending ? 'Saving…' : 'Add'}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function RecurringCard({ merchants, knownCustomCategories }: Props) {
  const [showForm, setShowForm] = useState(false)

  if (merchants.length === 0 && !showForm) {
    return (
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              Recurring charges
            </h3>
            <p className="text-[13px] text-[var(--muted-text)] mt-0.5">None detected this month</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] bg-[var(--bg)] border border-[var(--hairline)] rounded-[8px] hover:text-[var(--ink)] hover:border-[var(--ink)] transition-colors cursor-pointer"
          >
            <Plus size={12} />
            Add
          </button>
        </div>
        {showForm && (
          <AddForm knownCustomCategories={knownCustomCategories} onDone={() => setShowForm(false)} />
        )}
      </div>
    )
  }

  const monthlyTotal = merchants.reduce((s, m) => s + m.avgAmount, 0)

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Recurring charges
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            Same day each month (±2 days)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Est. monthly</p>
            <p className="font-bold text-[20px] tabular-nums text-[var(--ink)] mt-0.5">{formatCAD(monthlyTotal)}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            title="Add recurring charge"
            className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-[var(--hairline)]">
        {merchants.map((m) => (
          <div key={m.merchantName} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Repeat2 size={13} className="text-[var(--faint)] shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[14px] font-medium text-[var(--ink)] truncate">{m.merchantName}</p>
                  {m.isManual && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
                      Manual
                    </span>
                  )}
                </div>
                <p className="text-[12px]" style={{ color: getCategoryColor(m.category) }}>
                  {getCategoryLabel(m.category)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <div className="text-right">
                <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">~{formatCAD(m.avgAmount)}</p>
                <p className="text-[11px] text-[var(--faint)]">~{ordinal(m.dayOfMonth)} of each month</p>
              </div>
              <DeleteButton merchantName={m.merchantName} isManual={m.isManual} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <AddForm knownCustomCategories={knownCustomCategories} onDone={() => setShowForm(false)} />
      )}
    </div>
  )
}
