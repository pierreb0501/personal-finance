'use client'

import { useState } from 'react'
import { formatCAD } from '@/lib/format'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS } from '@/lib/categories'
import { Check, Minus, X, Plus, Repeat2, FolderOpen, Folder, ChevronDown, ChevronRight } from 'lucide-react'
import {
  addCommittedIncomeItem,
  addCommittedExpenseItem,
  deleteCommittedItem,
  addRecurring,
  removeManualRecurring,
  dismissRecurring,
  updateRecurringCategory,
  setItemGroup,
  setMerchantGroup,
} from '@/app/actions'
import type { CommittedItemWithStatus, RecurringMerchantWithStatus } from '@/lib/db/queries'

type Props = {
  incomeItems: CommittedItemWithStatus[]
  expenseItems: CommittedItemWithStatus[]
  chargeItems: RecurringMerchantWithStatus[]
  knownCustomCategories: string[]
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

type ConfirmState = 'full' | 'partial' | 'pending'

function confirmState(confirmed: number | null, expected: number): ConfirmState {
  if (confirmed === null || confirmed === 0) return 'pending'
  if (confirmed >= expected * 0.95) return 'full'
  return 'partial'
}

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function StatusDot({ state, isCharge = false }: { state: ConfirmState; isCharge?: boolean }) {
  if (state === 'full') {
    const bg = isCharge ? 'bg-[#f6e8e4]' : 'bg-[#e8f4ed]'
    const color = isCharge ? 'text-[var(--negative)]' : 'text-[var(--positive)]'
    return (
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
        <Check size={11} className={color} strokeWidth={2.5} />
      </div>
    )
  }
  if (state === 'partial') {
    return (
      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[#fdf3e3]">
        <Minus size={11} className="text-amber-500" strokeWidth={2.5} />
      </div>
    )
  }
  return (
    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[#f0ede5]">
      <div className="w-1.5 h-1.5 rounded-full bg-[var(--faint)]" />
    </div>
  )
}

function AccountLabel({ label }: { label: string | null }) {
  if (!label) return null
  return (
    <span className="text-[10px] font-medium text-[var(--faint)] bg-[#f5f4f2] border border-[var(--hairline)] px-1.5 py-0.5 rounded-full shrink-0">
      {label}
    </span>
  )
}

function DeleteCommittedBtn({ id }: { id: string }) {
  const [pending, setPending] = useState(false)
  async function handle() {
    setPending(true)
    await deleteCommittedItem(id)
    setPending(false)
  }
  return (
    <button onClick={handle} disabled={pending}
      className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer">
      <X size={13} />
    </button>
  )
}

function allCategories(knownCustomCategories: string[]) {
  return [
    ...Object.keys(CATEGORY_LABELS),
    ...knownCustomCategories.filter((c) => !CATEGORY_LABELS[c]),
  ]
}

// ─── Group picker ──────────────────────────────────────────────────────────────

function GroupPicker({ currentGroup, knownGroups, onAssign }: {
  currentGroup: string | null
  knownGroups: string[]
  onAssign: (g: string | null) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [pending, setPending] = useState(false)

  async function assign(g: string | null) {
    setPending(true)
    setOpen(false)
    await onAssign(g)
    setPending(false)
  }

  async function createAndAssign() {
    const g = newGroup.trim()
    if (!g) return
    setNewGroup('')
    await assign(g)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={pending}
        title={currentGroup ? `Group: ${currentGroup}` : 'Assign to group'}
        className={[
          'p-1 rounded-[6px] transition-colors cursor-pointer disabled:opacity-40',
          currentGroup
            ? 'text-[var(--accent-dark)] hover:bg-[#f0ede5]'
            : 'text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5]',
        ].join(' ')}
      >
        {currentGroup ? <Folder size={13} /> : <FolderOpen size={13} />}
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-10 bg-white border border-[var(--hairline)] rounded-[12px] shadow-lg p-2 min-w-[160px]">
          {knownGroups.length > 0 && (
            <>
              {knownGroups.map((g) => (
                <button key={g} onClick={() => assign(g === currentGroup ? null : g)}
                  className={[
                    'w-full text-left px-2.5 py-1.5 text-[13px] rounded-[8px] transition-colors cursor-pointer',
                    g === currentGroup
                      ? 'bg-[var(--accent-dark)] text-white'
                      : 'text-[var(--ink)] hover:bg-[#f0ede5]',
                  ].join(' ')}>
                  {g}
                </button>
              ))}
              <div className="border-t border-[var(--hairline)] my-1.5" />
            </>
          )}
          <div className="flex items-center gap-1.5 px-1">
            <input
              type="text"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createAndAssign() }}
              placeholder="New folder…"
              className="flex-1 text-[12px] px-2 py-1 bg-[var(--bg)] border border-[var(--hairline)] rounded-[6px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none"
            />
            <button onClick={createAndAssign} disabled={!newGroup.trim()}
              className="p-1 rounded-[6px] bg-[var(--ink)] text-white hover:opacity-80 disabled:opacity-30 cursor-pointer">
              <Check size={11} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Group section wrapper ────────────────────────────────────────────────────

function GroupSection({ name, children, itemCount, confirmedCount }: {
  name: string | null
  children: React.ReactNode
  itemCount: number
  confirmedCount: number
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (!name) return <>{children}</>

  return (
    <div className="mb-1">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full py-2 text-left group"
      >
        {collapsed ? <ChevronRight size={13} className="text-[var(--faint)]" /> : <ChevronDown size={13} className="text-[var(--faint)]" />}
        <Folder size={13} className="text-[var(--accent-dark)]" />
        <span className="text-[13px] font-semibold text-[var(--ink)]">{name}</span>
        <span className="text-[11px] text-[var(--faint)] ml-1">{confirmedCount}/{itemCount}</span>
      </button>
      {!collapsed && (
        <div className="pl-5 border-l-2 border-[var(--hairline)] ml-1.5">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Income section ───────────────────────────────────────────────────────────

function AddIncomeForm({ knownCustomCategories, onDone }: { knownCustomCategories: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('INCOME')
  const [pending, setPending] = useState(false)
  const cats = allCategories(knownCustomCategories)

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
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Salary)"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monthly expected (CAD)"
          min={0} step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={day} onChange={(e) => setDay(e.target.value)} placeholder="Day of month (optional)"
          min={1} max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Keyword to match transactions"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <p className="col-span-2 text-[11px] text-[var(--faint)]">
          Keyword matches all transactions from that source — bi-weekly payments are summed automatically.
        </p>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none">
          {cats.map((c) => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={handle} disabled={pending || !name.trim() || !amount}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--ink)] text-white rounded-[8px] hover:opacity-80 disabled:opacity-40 cursor-pointer">
          <Check size={12} />{pending ? 'Saving…' : 'Add'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] cursor-pointer">Cancel</button>
      </div>
    </div>
  )
}

function IncomeRow({ item, knownGroups }: { item: CommittedItemWithStatus; knownGroups: string[] }) {
  const state = confirmState(item.confirmedAmount, item.expectedAmount)

  async function handleGroup(g: string | null) {
    await setItemGroup(item.id, g)
  }

  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot state={state} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-[var(--ink)] truncate">{item.name}</p>
            {item.confirmedAccountLabel && state !== 'pending' && (
              <AccountLabel label={item.confirmedAccountLabel} />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px]" style={{ color: getCategoryColor(item.category) }}>
              {getCategoryLabel(item.category)}
            </span>
            {item.expectedDay && (
              <span className="text-[11px] text-[var(--faint)]">· {ordinal(item.expectedDay)} of each month</span>
            )}
            {item.merchantName && (
              <span className="text-[11px] text-[var(--faint)]">· matches "{item.merchantName}"</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-4">
        <div className="text-right">
          <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">{formatCAD(item.expectedAmount)}</p>
          {state === 'full' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--positive)] bg-[#e8f4ed] px-1.5 py-0.5 rounded-full">
              <Check size={9} />{formatCAD(item.confirmedAmount!)}
              {item.confirmedCount > 1 && <span className="opacity-70">· {item.confirmedCount}×</span>}
            </span>
          )}
          {state === 'partial' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-[#fdf3e3] px-1.5 py-0.5 rounded-full">
              <Minus size={9} />{formatCAD(item.confirmedAmount!)} of {formatCAD(item.expectedAmount)}
              {item.confirmedCount > 1 && <span className="opacity-70">· {item.confirmedCount}×</span>}
            </span>
          )}
          {state === 'pending' && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full">Pending</span>
          )}
        </div>
        <GroupPicker currentGroup={item.groupName} knownGroups={knownGroups} onAssign={handleGroup} />
        <DeleteCommittedBtn id={item.id} />
      </div>
    </div>
  )
}

function IncomeSection({ items, knownCustomCategories }: { items: CommittedItemWithStatus[]; knownCustomCategories: string[] }) {
  const [showForm, setShowForm] = useState(false)

  const expectedTotal = items.reduce((s, i) => s + i.expectedAmount, 0)
  const confirmedTotal = items.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0)
  const confirmedCount = items.filter((i) => confirmState(i.confirmedAmount, i.expectedAmount) !== 'pending').length

  // Collect all known group names
  const knownGroups = [...new Set(items.map((i) => i.groupName).filter(Boolean) as string[])]

  // Split into groups and ungrouped
  const grouped = new Map<string, CommittedItemWithStatus[]>()
  const ungrouped: CommittedItemWithStatus[] = []
  for (const item of items) {
    if (item.groupName) {
      const g = grouped.get(item.groupName) ?? []
      g.push(item)
      grouped.set(item.groupName, g)
    } else {
      ungrouped.push(item)
    }
  }

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise mb-[18px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">Recurring Income</h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            {items.length > 0 ? `${confirmedCount} of ${items.length} received this month` : 'Track your expected monthly income'}
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
              {confirmedTotal > 0 && confirmedTotal < expectedTotal * 0.95 && (
                <p className="text-[11px] text-[var(--faint)]">of {formatCAD(expectedTotal)}</p>
              )}
            </div>
          )}
          <button onClick={() => setShowForm(!showForm)} title="Add income source"
            className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer">
            <Plus size={14} />
          </button>
        </div>
      </div>

      {items.length === 0 && !showForm ? (
        <p className="text-[13px] text-[var(--faint)]">No income sources added yet — click <Plus size={11} className="inline" /> to start tracking.</p>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([groupName, groupItems]) => {
            const gc = groupItems.filter((i) => confirmState(i.confirmedAmount, i.expectedAmount) !== 'pending').length
            return (
              <GroupSection key={groupName} name={groupName} itemCount={groupItems.length} confirmedCount={gc}>
                {groupItems.map((item) => <IncomeRow key={item.id} item={item} knownGroups={knownGroups} />)}
              </GroupSection>
            )
          })}
          {ungrouped.length > 0 && (
            <div className={grouped.size > 0 ? 'mt-1' : ''}>
              {ungrouped.map((item) => <IncomeRow key={item.id} item={item} knownGroups={knownGroups} />)}
            </div>
          )}
        </div>
      )}
      {showForm && <AddIncomeForm knownCustomCategories={knownCustomCategories} onDone={() => setShowForm(false)} />}
    </div>
  )
}

// ─── Charges section ──────────────────────────────────────────────────────────

function CategoryPicker({ merchantName, category, isManual, knownCustomCategories }: {
  merchantName: string; category: string; isManual: boolean; knownCustomCategories: string[]
}) {
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [current, setCurrent] = useState(category)
  const cats = allCategories(knownCustomCategories)

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setCurrent(next)
    setPending(true)
    setEditing(false)
    await updateRecurringCategory(merchantName, next, isManual)
    setPending(false)
  }

  if (editing) {
    return (
      <select autoFocus value={current} onChange={handleChange} onBlur={() => setEditing(false)}
        className="text-[12px] border border-[var(--hairline)] rounded-[6px] px-1.5 py-0.5 bg-white text-[var(--ink)] focus:outline-none">
        {cats.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
      </select>
    )
  }

  return (
    <button onClick={() => setEditing(true)} disabled={pending}
      className="text-[12px] text-left hover:underline cursor-pointer disabled:opacity-50"
      style={{ color: getCategoryColor(current) }}>
      {getCategoryLabel(current)}
    </button>
  )
}

function DeleteChargeButton({ merchantName, isManual }: { merchantName: string; isManual: boolean }) {
  const [pending, setPending] = useState(false)
  async function handle() {
    setPending(true)
    if (isManual) await removeManualRecurring(merchantName)
    else await dismissRecurring(merchantName)
    setPending(false)
  }
  return (
    <button onClick={handle} disabled={pending} title="Remove"
      className="p-1 rounded-[6px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer">
      <X size={13} />
    </button>
  )
}

function AddExpenseForm({ knownCustomCategories, onDone }: { knownCustomCategories: string[]; onDone: () => void }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [day, setDay] = useState('')
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('RENT_AND_UTILITIES')
  const [pending, setPending] = useState(false)
  const cats = allCategories(knownCustomCategories)

  async function handle() {
    if (!name.trim() || !amount) return
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) return
    const dayNum = day ? Math.min(31, Math.max(1, Number(day))) : undefined
    setPending(true)
    await addCommittedExpenseItem(name.trim(), amt, category, dayNum, merchant.trim() || undefined)
    setPending(false)
    onDone()
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] mb-3">Add committed charge</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Rent)"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Expected amount (CAD)"
          min={0} step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={day} onChange={(e) => setDay(e.target.value)} placeholder="Day of month (optional)"
          min={1} max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Keyword to match transactions"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none">
          {cats.map((c) => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={handle} disabled={pending || !name.trim() || !amount}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--ink)] text-white rounded-[8px] hover:opacity-80 disabled:opacity-40 cursor-pointer">
          <Check size={12} />{pending ? 'Saving…' : 'Add'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] cursor-pointer">Cancel</button>
      </div>
    </div>
  )
}

function AddAutoChargeForm({ knownCustomCategories, onDone }: { knownCustomCategories: string[]; onDone: () => void }) {
  const [merchantName, setMerchantName] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('GENERAL_SERVICES')
  const [pending, setPending] = useState(false)
  const cats = allCategories(knownCustomCategories)

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
        <input type="text" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="Merchant name"
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} placeholder="Day of month (1–31)"
          min={1} max={31}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (CAD)"
          min={0} step={0.01}
          className="px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none" />
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          className="col-span-2 px-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] focus:outline-none">
          {cats.map(c => <option key={c} value={c}>{getCategoryLabel(c)}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={handle} disabled={pending || !merchantName.trim() || !dayOfMonth || !amount}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[var(--ink)] text-white rounded-[8px] hover:opacity-80 disabled:opacity-40 cursor-pointer">
          <Check size={12} />{pending ? 'Saving…' : 'Add'}
        </button>
        <button onClick={onDone} className="px-3 py-1.5 text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] cursor-pointer">Cancel</button>
      </div>
    </div>
  )
}

type ChargeItem =
  | { kind: 'committed'; data: CommittedItemWithStatus }
  | { kind: 'auto'; data: RecurringMerchantWithStatus }

function ChargeRow({ item, knownGroups, knownCustomCategories }: {
  item: ChargeItem
  knownGroups: string[]
  knownCustomCategories: string[]
}) {
  if (item.kind === 'committed') {
    const d = item.data
    const state = confirmState(d.confirmedAmount, d.expectedAmount)
    return (
      <div className="flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot state={state} isCharge />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[14px] font-medium text-[var(--ink)] truncate">{d.name}</p>
              {d.confirmedAccountLabel && state !== 'pending' && <AccountLabel label={d.confirmedAccountLabel} />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[11px]" style={{ color: getCategoryColor(d.category) }}>{getCategoryLabel(d.category)}</span>
              {d.expectedDay && <span className="text-[11px] text-[var(--faint)]">· {ordinal(d.expectedDay)} of each month</span>}
              {d.merchantName && <span className="text-[11px] text-[var(--faint)]">· matches "{d.merchantName}"</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-4">
          <div className="text-right">
            <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">{formatCAD(d.expectedAmount)}</p>
            {state === 'full' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--negative)] bg-[#f6e8e4] px-1.5 py-0.5 rounded-full">
                <Check size={9} />{formatCAD(d.confirmedAmount!)}
              </span>
            )}
            {state === 'partial' && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-[#fdf3e3] px-1.5 py-0.5 rounded-full">
                <Minus size={9} />{formatCAD(d.confirmedAmount!)} of {formatCAD(d.expectedAmount)}
              </span>
            )}
            {state === 'pending' && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full">Pending</span>
            )}
          </div>
          <GroupPicker currentGroup={d.groupName} knownGroups={knownGroups} onAssign={(g) => setItemGroup(d.id, g)} />
          <DeleteCommittedBtn id={d.id} />
        </div>
      </div>
    )
  }

  const m = item.data
  const state: ConfirmState = m.confirmedAmount !== null ? 'full' : 'pending'
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--hairline)] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <StatusDot state={state} isCharge />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-medium text-[var(--ink)] truncate">{m.merchantName}</p>
            {m.isManual && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full shrink-0">Manual</span>
            )}
            {m.confirmedAccountLabel && state !== 'pending' && <AccountLabel label={m.confirmedAccountLabel} />}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <CategoryPicker merchantName={m.merchantName} category={m.category} isManual={m.isManual} knownCustomCategories={knownCustomCategories} />
            <span className="text-[11px] text-[var(--faint)]">· ~{ordinal(m.dayOfMonth)} of each month</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-4">
        <div className="text-right">
          <p className="text-[14px] font-semibold tabular-nums text-[var(--ink)]">~{formatCAD(m.avgAmount)}</p>
          {m.confirmedAmount !== null ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--negative)] bg-[#f6e8e4] px-1.5 py-0.5 rounded-full">
              <Repeat2 size={9} />{formatCAD(m.confirmedAmount)}
              {m.confirmedDate && <span className="opacity-70">· {formatDate(m.confirmedDate)}</span>}
            </span>
          ) : m.likelyCancelled ? (
            <span
              title="Missed its expected day two months in a row — may have been cancelled. Remove it with the X if so."
              className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-[#fdf3e3] px-1.5 py-0.5 rounded-full"
            >
              Possibly cancelled
            </span>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--faint)] bg-[#f0ede5] px-1.5 py-0.5 rounded-full">Pending</span>
          )}
        </div>
        <GroupPicker
          currentGroup={m.groupName}
          knownGroups={knownGroups}
          onAssign={(g) => setMerchantGroup(m.merchantName, g, m.isManual)}
        />
        <DeleteChargeButton merchantName={m.merchantName} isManual={m.isManual} />
      </div>
    </div>
  )
}

function ChargesSection({ expenseItems, chargeItems, knownCustomCategories }: {
  expenseItems: CommittedItemWithStatus[]
  chargeItems: RecurringMerchantWithStatus[]
  knownCustomCategories: string[]
}) {
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showChargeForm, setShowChargeForm] = useState(false)

  // Merge both lists into a unified type for grouping
  const all: ChargeItem[] = [
    ...expenseItems.map((d): ChargeItem => ({ kind: 'committed', data: d })),
    ...chargeItems.map((d): ChargeItem => ({ kind: 'auto', data: d })),
  ]

  const knownGroups = [...new Set(all.map((i) => i.data.groupName).filter(Boolean) as string[])]

  const grouped = new Map<string, ChargeItem[]>()
  const ungrouped: ChargeItem[] = []
  for (const item of all) {
    const g = item.data.groupName
    if (g) {
      const arr = grouped.get(g) ?? []
      arr.push(item)
      grouped.set(g, arr)
    } else {
      ungrouped.push(item)
    }
  }

  const totalExpected = expenseItems.reduce((s, i) => s + i.expectedAmount, 0) + chargeItems.reduce((s, m) => s + m.avgAmount, 0)
  const totalConfirmed = expenseItems.reduce((s, i) => s + (i.confirmedAmount ?? 0), 0) + chargeItems.reduce((s, m) => s + (m.confirmedAmount ?? 0), 0)
  const confirmedCount =
    expenseItems.filter((i) => confirmState(i.confirmedAmount, i.expectedAmount) !== 'pending').length +
    chargeItems.filter((m) => m.confirmedAmount !== null).length

  const hasAnything = all.length > 0 || showExpenseForm || showChargeForm

  return (
    <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">Recurring Charges</h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5">
            {all.length > 0 ? `${confirmedCount} of ${all.length} charged this month` : 'Track your recurring expenses'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalExpected > 0 && (
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">
                {totalConfirmed > 0 ? 'Charged' : 'Est. monthly'}
              </p>
              <p className="font-bold text-[20px] tabular-nums text-[var(--ink)] mt-0.5">
                {formatCAD(totalConfirmed > 0 ? totalConfirmed : totalExpected)}
              </p>
              {totalConfirmed > 0 && totalConfirmed < totalExpected * 0.95 && (
                <p className="text-[11px] text-[var(--faint)]">of {formatCAD(totalExpected)}</p>
              )}
            </div>
          )}
          <div className="flex gap-1">
            <button onClick={() => { setShowExpenseForm(!showExpenseForm); setShowChargeForm(false) }}
              title="Add committed charge (rent, etc.)"
              className="flex items-center gap-1 p-1.5 rounded-[8px] text-[11px] font-medium text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer">
              <Plus size={12} />Committed
            </button>
            <button onClick={() => { setShowChargeForm(!showChargeForm); setShowExpenseForm(false) }}
              title="Add auto-detected charge"
              className="flex items-center gap-1 p-1.5 rounded-[8px] text-[11px] font-medium text-[var(--faint)] hover:text-[var(--ink)] hover:bg-[#f0ede5] transition-colors cursor-pointer">
              <Plus size={12} />Auto
            </button>
          </div>
        </div>
      </div>

      {!hasAnything ? (
        <p className="text-[13px] text-[var(--faint)]">
          No recurring charges yet. Use <strong>+ Committed</strong> for fixed expenses like rent, or <strong>+ Auto</strong> for merchants detected from your transactions.
        </p>
      ) : (
        <div>
          {Array.from(grouped.entries()).map(([groupName, groupItems]) => {
            const gc = groupItems.filter((i) => {
              if (i.kind === 'committed') return confirmState(i.data.confirmedAmount, i.data.expectedAmount) !== 'pending'
              return i.data.confirmedAmount !== null
            }).length
            return (
              <GroupSection key={groupName} name={groupName} itemCount={groupItems.length} confirmedCount={gc}>
                {groupItems.map((item) => (
                  <ChargeRow
                    key={item.kind === 'committed' ? item.data.id : item.data.merchantName}
                    item={item}
                    knownGroups={knownGroups}
                    knownCustomCategories={knownCustomCategories}
                  />
                ))}
              </GroupSection>
            )
          })}
          {ungrouped.length > 0 && (
            <div className={grouped.size > 0 ? 'mt-1' : ''}>
              {ungrouped.map((item) => (
                <ChargeRow
                  key={item.kind === 'committed' ? item.data.id : item.data.merchantName}
                  item={item}
                  knownGroups={knownGroups}
                  knownCustomCategories={knownCustomCategories}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showExpenseForm && <AddExpenseForm knownCustomCategories={knownCustomCategories} onDone={() => setShowExpenseForm(false)} />}
      {showChargeForm && <AddAutoChargeForm knownCustomCategories={knownCustomCategories} onDone={() => setShowChargeForm(false)} />}
    </div>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export function RecurringChecklist({ incomeItems, expenseItems, chargeItems, knownCustomCategories }: Props) {
  return (
    <>
      <IncomeSection items={incomeItems} knownCustomCategories={knownCustomCategories} />
      <ChargesSection expenseItems={expenseItems} chargeItems={chargeItems} knownCustomCategories={knownCustomCategories} />
    </>
  )
}
