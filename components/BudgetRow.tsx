'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { saveCategoryBudget, deleteCategoryBudget } from '@/app/actions'

type Props = {
  category: string
  spent: number
  monthlyLimit: number | null // null = no budget set yet
  onDelete?: () => void
}

export function BudgetRow({ category, spent, monthlyLimit }: Props) {
  const [limit, setLimit] = useState(monthlyLimit)
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(monthlyLimit ?? ''))
  const [saving, setSaving] = useState(false)

  const color = getCategoryColor(category)
  const label = getCategoryLabel(category)
  const ratio = limit && limit > 0 ? spent / limit : null
  const overBudget = ratio !== null && ratio > 1

  async function commitLimit() {
    const parsed = parseFloat(inputVal.replace(/[^0-9.]/g, ''))
    if (!isNaN(parsed) && parsed > 0) {
      setSaving(true)
      await saveCategoryBudget(category, parsed)
      setLimit(parsed)
      setSaving(false)
    }
    setEditing(false)
  }

  async function removeLimit() {
    setSaving(true)
    await deleteCategoryBudget(category)
    setLimit(null)
    setSaving(false)
  }

  return (
    <div className="py-4 border-b border-[var(--hairline)] last:border-0">
      <div className="flex items-center justify-between gap-4 mb-2">
        {/* Category label */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[14px] font-semibold text-[var(--ink)] truncate">{label}</span>
        </div>

        {/* Spent / limit */}
        <div className="flex items-center gap-3 shrink-0">
          <span className={['text-[14px] font-semibold tabular-nums', overBudget ? 'text-[var(--negative)]' : 'text-[var(--ink)]'].join(' ')}>
            {formatCAD(spent)}
          </span>

          {limit !== null && !editing && (
            <>
              <span className="text-[13px] text-[var(--faint)]">of</span>
              <button
                onClick={() => { setInputVal(String(limit)); setEditing(true) }}
                className="text-[14px] font-semibold tabular-nums text-[var(--muted-text)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              >
                {formatCAD(limit)}
              </button>
              <button
                onClick={removeLimit}
                disabled={saving}
                className="text-[var(--faint)] hover:text-[var(--negative)] transition-colors cursor-pointer"
                title="Remove budget"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}

          {editing && (
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-[var(--faint)]">of $</span>
              <input
                autoFocus
                type="number"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onBlur={commitLimit}
                onKeyDown={(e) => { if (e.key === 'Enter') commitLimit(); if (e.key === 'Escape') setEditing(false) }}
                className="w-24 text-[14px] font-semibold tabular-nums border-b-2 border-[var(--accent-dark)] outline-none bg-transparent text-[var(--ink)]"
                min={0}
              />
            </div>
          )}

          {limit === null && !editing && (
            <button
              onClick={() => { setInputVal(''); setEditing(true) }}
              className="flex items-center gap-1 text-[12px] text-[var(--accent-dark)] hover:opacity-70 transition-opacity cursor-pointer"
            >
              <Plus size={12} />
              Set limit
            </button>
          )}
        </div>
      </div>

      {/* Progress bar — only shown when a limit is set */}
      {limit !== null && limit > 0 && (
        <div className="h-[7px] bg-[#eee9df] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min((spent / limit) * 100, 100)}%`,
              backgroundColor: overBudget ? 'var(--negative)' : color,
            }}
          />
        </div>
      )}

      {/* Over-budget label */}
      {overBudget && limit !== null && (
        <p className="text-[11px] text-[var(--negative)] font-semibold mt-1">
          Over by {formatCAD(spent - limit)}
        </p>
      )}
    </div>
  )
}
