'use client'

import { useState } from 'react'
import { getCategoryLabel } from '@/lib/categories'
import { saveCategoryBudget } from '@/app/actions'
import { Plus } from 'lucide-react'

type Props = {
  categories: string[]
  year: number
  month: number
}

export function AddCategoryBudget({ categories, year, month }: Props) {
  const [selected, setSelected] = useState('')
  const [planned, setPlanned] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const parsed = parseFloat(planned.replace(/[^0-9.]/g, ''))
    if (!selected || isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    await saveCategoryBudget(selected, year, month, parsed)
    setSelected('')
    setPlanned('')
    setSaving(false)
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex-1 min-w-[180px]">
        <label className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] block mb-1.5">
          Category
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full text-[14px] border border-[var(--hairline)] rounded-[10px] px-3 py-2.5 bg-[var(--canvas)] text-[var(--ink)] outline-none focus:border-[var(--accent-dark)] cursor-pointer"
        >
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c} value={c}>{getCategoryLabel(c)}</option>
          ))}
        </select>
      </div>

      <div className="w-40">
        <label className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] block mb-1.5">
          Planned amount ($)
        </label>
        <input
          type="number"
          value={planned}
          onChange={(e) => setPlanned(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="e.g. 500"
          min={0}
          className="w-full text-[14px] border border-[var(--hairline)] rounded-[10px] px-3 py-2.5 bg-[var(--canvas)] text-[var(--ink)] outline-none focus:border-[var(--accent-dark)] tabular-nums"
        />
      </div>

      <button
        onClick={handleAdd}
        disabled={!selected || !planned || saving}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent-dark)] text-white text-[14px] font-semibold rounded-[10px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus size={14} />
        Add to plan
      </button>
    </div>
  )
}
