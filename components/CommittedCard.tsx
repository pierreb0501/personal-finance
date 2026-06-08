'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
import { Check, X, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import {
  addCommittedIncomeItem,
  addCommittedExpenseItem,
  deleteCommittedItem,
} from '@/app/actions'
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

function StatusBadge({ confirmed, amount }: { confirmed: boolean; amount: number | null }) {
  if (confirmed && amount !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--positive)] bg-[#e8f4ed] px-1.5 py-0.5 rounded-full shrink-0">
        <Check size={9} />
        {formatCAD(amount)}
      </span>
    )
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">
      Pending
    </span>
  )
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

function AddForm({
  type,
  knownCustomCategories,
  onDone,
}: {
  type: 'income' | 'expense'
  knownCustomCategories: string[]
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [merchant, setMerchant] = useState('')
  const defaultCat = type === 'income' ? 'INCOME' : 'GENERAL_SERVICES'
  const [category, setCategory] = useState(defaultCat)
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
    if (type === 'income') {
      await addCommittedIncomeItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    } else {
      await addCommittedExpenseItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    }
    setPending(false)
    onDone()
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--hairline)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-2">
        Add {type === 'income' ? 'income source' : 'fixed expense'}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label (e.g. Bell Internet)"
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
          placeholder="Merchant keyword (optional)"
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

function Section({
  type,
  items,
  knownCustomCategories,
}: {
  type: 'income' | 'expense'
  items: CommittedItemWithStatus[]
  knownCustomCategories: string[]
}) {
  const [showForm, setShowForm] = useState(false)
  const isIncome = type === 'income'
  const label = isIncome ? 'Income' : 'Fixed Expenses'
  const Icon = isIncome ? TrendingUp : TrendingDown
  const confirmed = items.filter((i) => i.confirmedAmount !== null)
  const total = items.reduce((s, i) => s + i.expectedAmount, 0)
  const confirmedTotal = confirmed.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={14} className={isIncome ? 'text-[var(--positive)]' : 'text-[var(--negative)]'} />
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-[var(--muted-text)]">{label}</p>
          <span className="text-[11px] text-[var(--faint)]">
            {confirmed.length}/{items.length} confirmed
          </span>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <p className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">
              {confirmedTotal > 0
                ? <>{formatCAD(confirmedTotal)} <span className="text-[var(--faint)] font-normal">/ {formatCAD(total)}</span></>
                : formatCAD(total)
              }
            </p>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {items.length === 0 && !showForm && (
        <p className="text-[13px] text-[var(--faint)] pb-1">
          None added — click <Plus size={11} className="inline" /> to track {isIncome ? 'an income source' : 'a fixed expense'}.
        </p>
      )}

      <div className="divide-y divide-[var(--hairline)]">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: getCategoryColor(item.category) }}
              />
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--ink)] truncate">{item.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[var(--faint)]" style={{ color: getCategoryColor(item.category) }}>
                    {getCategoryLabel(item.category)}
                  </span>
                  {item.expectedDay && (
                    <span className="text-[11px] text-[var(--faint)]">· {ordinal(item.expectedDay)}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <div className="text-right">
                <p className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">
                  {formatCAD(item.expectedAmount)}
                </p>
                <StatusBadge confirmed={item.confirmedAmount !== null} amount={item.confirmedAmount} />
              </div>
              <DeleteBtn id={item.id} />
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <AddForm
          type={type}
          knownCustomCategories={knownCustomCategories}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

export function CommittedCard({ items, knownCustomCategories }: Props) {
  const incomeItems = items.filter((i) => i.type === 'income')
  const expenseItems = items.filter((i) => i.type === 'expense')

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mt-[18px]">
      <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-5">
        Monthly Commitments
      </h3>

      <Section type="income" items={incomeItems} knownCustomCategories={knownCustomCategories} />

      <div className="my-5 border-t border-[var(--hairline)]" />

      <Section type="expense" items={expenseItems} knownCustomCategories={knownCustomCategories} />
    </div>
  )
}
