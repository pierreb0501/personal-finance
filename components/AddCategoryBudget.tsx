'use client'

import { useState } from 'react'
import { getCategoryColor, getCategoryLabel } from '@/lib/categories'
import { saveCategoryBudget } from '@/app/actions'
import { Plus } from 'lucide-react'

export function AddCategoryBudget({ categories }: { categories: string[] }) {
  const [selected, setSelected] = useState('')
  const [limit, setLimit] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const parsed = parseFloat(limit.replace(/[^0-9.]/g, ''))
    if (!selected || isNaN(parsed) || parsed <= 0) return
    setSaving(true)
    await saveCategoryBudget(selected, parsed)
    setSelected('')
    setLimit('')
    setSaving(false)
  }

  return (
    <div className="flex items-end gap-3 flex-wrap">
      {/* Category picker */}
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

      {/* Limit input */}
      <div className="w-36">
        <label className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] block mb-1.5">
          Monthly limit ($)
        </label>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="e.g. 500"
          min={0}
          className="w-full text-[14px] border border-[var(--hairline)] rounded-[10px] px-3 py-2.5 bg-[var(--canvas)] text-[var(--ink)] outline-none focus:border-[var(--accent-dark)] tabular-nums"
        />
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!selected || !limit || saving}
        className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent-dark)] text-white text-[14px] font-semibold rounded-[10px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus size={14} />
        Add limit
      </button>
    </div>
  )
}
