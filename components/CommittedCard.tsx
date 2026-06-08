'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
import { Check, X, Plus } from 'lucide-react'
import { addCommittedIncomeItem, deleteCommittedItem } from '@/app/actions'
import type { CommittedItemWithStatus } from '@/lib/db/queries'

type Props = {
  items: CommittedItemWithStatus[]
  knownCustomCategories: string[]
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function DeleteBtn({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  async function handle() {
    setPending(true)
    await deleteCommittedItem(id)
    setPending(false)
  }
  return (
    <button
      onClick={handle}
      disabled={pending}
      className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer"
    >
      <X size={13} />
    </button>
  )
}

function AddForm({ knownCustomCategories, onDone }: { knownCustomCategories: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('INCOME')
  const [pending, setPending] = useState(false)

  const allCategories = [
    ...Object.keys(CATEGORY_LABELS),
    ...knownCustomCategories.filter((c) => !CATEGORY_LABELS[c]),
  ]

  async function handle() {
    if (!name.trim() || !amount) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return
    const dayNum = day ? Math.min(31, Math.max(1, Number(day))) : undefined
    setPending(true)
    await addCommittedIncomeItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    setPending(false)
    onDone()
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-3">Add income source</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. CN Rail Salary)"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Expected amount (CAD)"
          min={0}
          step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="number"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          placeholder="Day of month (optional)"
          min={1}
          max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <input
          type="text"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder="Keyword to match (optional)"
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        >
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handle}
          disabled={pending || !name.trim() || !amount}
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

export function CommittedCard({ items, knownCustomCategories }: Props) {
  const [showForm, setShowForm] = useState(false)
  const incomeItems = items.filter((i) => i.type === 'income')
  const confirmedCount = incomeItems.filter((i) => i.confirmedAmount !== null).length
  const expectedTotal = incomeItems.reduce((s, i) => s + i.expectedAmount, 0)
  const confirmedTotal = incomeItems.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0)

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Recurring Income
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            {incomeItems.length > 0
              ? `${confirmedCount} of ${incomeItems.length} received this month`
              : 'Track your expected monthly income'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {expectedTotal > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
                {confirmedTotal > 0 ? 'Received' : 'Expected'}
              </p>
              <p className="font-bold text-[20px] tabular-nums text-[var(--positive)] mt-0.5">
                {formatCAD(confirmedTotal > 0 ? confirmedTotal : expectedTotal)}
              </p>
              {confirmedTotal > 0 && confirmedTotal < expectedTotal && (
                <p className="text-[11px] text-[var(--faint)]">of {formatCAD(expectedTotal)}</p>
              )}
            </div>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            title="Add income source"
            className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {incomeItems.length === 0 && !showForm ? (
        <p className="text-[13px] text-[var(--faint)]">
          No income sources added yet — click <Plus size={11} className="inline" /> to start tracking.
        </p>
      ) : (
        <div className="divide-y divide-[var(--hairline)]">
          {incomeItems.map((item) => (
            <div key={item.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: getCategoryColor(item.category) }}
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-[var(--ink)] truncate">{item.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px]" style={{ color: getCategoryColor(item.category) }}>
                      {getCategoryLabel(item.category)}
                    </span>
                    {item.expectedDay && (
                      <span className="text-[11px] text-[var(--faint)]">· {ordinal(item.expectedDay)} of each month</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <div className="text-right">
                  <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">
                    {formatCAD(item.expectedAmount)}
                  </p>
                  {item.confirmedAmount !== null ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--positive)] bg-[#e8f4ed] px-1.5 py-0.5 rounded-full">
                      <Check size={9} />
                      {formatCAD(item.confirmedAmount)}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full">
                      Pending
                    </span>
                  )}
                </div>
                <DeleteBtn id={item.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AddForm knownCustomCategories={knownCustomCategories} onDone={() => setShowForm(false)} />
      )}
    </div>
  )
}
