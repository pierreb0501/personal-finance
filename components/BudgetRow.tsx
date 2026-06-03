'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import { saveCategoryBudget, deleteCategoryBudget } from '@/app/actions'

type Props = {
  category: string
  spent: number
  planned: number | null
  year: number
  month: number
}

export function BudgetRow({ category, spent, planned, year, month }: Props) {
  const [currentPlanned, setCurrentPlanned] = useState(planned)
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(planned ?? ''))
  const [saving, setSaving] = useState(false)

  const color = getCategoryColor(category)
  const label = getCategoryLabel(category)
  const overPlan = currentPlanned !== null && currentPlanned > 0 && spent > currentPlanned
  const ratio = currentPlanned && currentPlanned > 0 ? spent / currentPlanned : null

  async function commitPlan() {
    const parsed = parseFloat(inputVal.replace(/[^0-9.]/g, ''))
    if (!isNaN(parsed) && parsed > 0) {
      setSaving(true)
      await saveCategoryBudget(category, year, month, parsed)
      setCurrentPlanned(parsed)
      setSaving(false)
    }
    setEditing(false)
  }

  async function removePlan() {
    setSaving(true)
    await deleteCategoryBudget(category, year, month)
    setCurrentPlanned(null)
    setSaving(false)
  }

  return (
    <div className="py-4 border-b border-[var(--hairline)] last:border-0">
      {/* Row: category + spent + planned + actions */}
      <div className="flex items-center justify-between gap-4 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[14px] font-semibold text-[var(--ink)] truncate">{label}</span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 text-[14px] tabular-nums">
          {/* Actual spend */}
          <span className={['font-semibold', overPlan ? 'text-[var(--negative)]' : 'text-[var(--ink)]'].join(' ')}>
            {formatCAD(spent)}
          </span>

          {currentPlanned !== null && (
            <span className="text-[var(--faint)]">/</span>
          )}

          {/* Planned amount — click to edit */}
          {currentPlanned !== null && !editing && (
            <button
              onClick={() => { setInputVal(String(currentPlanned)); setEditing(true) }}
              className="font-medium text-[var(--muted-text)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              title="Edit planned amount"
            >
              {formatCAD(currentPlanned)}
            </button>
          )}

          {editing && (
            <div className="flex items-center gap-1">
              <span className="text-[var(--faint)]">$</span>
              <input
                autoFocus
                type="number"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onBlur={commitPlan}
                onKeyDown={(e) => { if (e.key === 'Enter') commitPlan(); if (e.key === 'Escape') setEditing(false) }}
                className="w-20 text-[14px] font-medium border-b-2 border-[var(--accent-dark)] outline-none bg-transparent text-[var(--ink)] tabular-nums"
                min={0}
              />
            </div>
          )}

          {/* Set plan / delete */}
          {currentPlanned === null && !editing && (
            <button
              onClick={() => { setInputVal(''); setEditing(true) }}
              className="text-[12px] text-[var(--accent-dark)] font-semibold hover:opacity-70 transition-opacity cursor-pointer px-2 py-0.5 rounded-[6px] bg-[#e6f1ea]"
            >
              + Plan
            </button>
          )}

          {currentPlanned !== null && !editing && (
            <button
              onClick={removePlan}
              disabled={saving}
              className="text-[var(--faint)] hover:text-[var(--negative)] transition-colors cursor-pointer ml-0.5"
              title="Remove from plan"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar — only when planned */}
      {currentPlanned !== null && currentPlanned > 0 && (
        <>
          <div className="h-[6px] bg-[#eee9df] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((spent / currentPlanned) * 100, 100)}%`,
                backgroundColor: overPlan ? 'var(--negative)' : color,
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[11px] text-[var(--faint)]">
              {ratio !== null ? `${Math.round(ratio * 100)}% of plan` : ''}
            </span>
            {overPlan && (
              <span className="text-[11px] font-semibold text-[var(--negative)]">
                {formatCAD(spent - currentPlanned)} over
              </span>
            )}
            {!overPlan && currentPlanned > 0 && (
              <span className="text-[11px] text-[var(--faint)]">
                {formatCAD(currentPlanned - spent)} left
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
