'use client'

import { useState, useRef, useEffect } from 'react'
import { getCategoryColor, getCategoryLabel, CATEGORY_LABELS, hashCategoryColor, slugifyCategory, type CategoryRule } from '@/lib/categories'
import { saveCategoryRule, saveTransactionCategory } from '@/app/actions'

type Props = {
  txId: string
  merchantName: string | null
  category: string
  isCredit?: boolean
  knownCustomCategories: string[]
}

const KNOWN_CATEGORIES = Object.keys(CATEGORY_LABELS)

export function CategoryChip({ txId, merchantName, category: initialCategory, isCredit, knownCustomCategories }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(initialCategory)
  const [search, setSearch] = useState('')
  const [applyToAll, setApplyToAll] = useState(true)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Combine seeded + custom categories
  const allCategories = [...new Set([...KNOWN_CATEGORIES, ...knownCustomCategories])]
  const filtered = allCategories.filter((c) =>
    getCategoryLabel(c).toLowerCase().includes(search.toLowerCase())
  )
  // Show search term as new category option if not matched
  const showCreate = search.length > 1 && !allCategories.some(
    (c) => getCategoryLabel(c).toLowerCase() === search.toLowerCase()
  )

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function handleSelect(selected: string) {
    setSaving(true)
    setCategory(selected)
    setOpen(false)
    if (merchantName && applyToAll) {
      await saveCategoryRule(merchantName, selected)
    }
    await saveTransactionCategory(txId, selected)
    setSaving(false)
  }

  const color = getCategoryColor(category)
  const label = getCategoryLabel(category)
  const isUnlabeledCredit = isCredit && category === 'TRANSFER_IN'

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className={[
          'flex items-center gap-1.5 text-[12px] transition-colors cursor-pointer',
          isUnlabeledCredit
            ? 'text-[var(--positive)] font-semibold hover:opacity-70'
            : 'text-[var(--muted-text)] hover:text-[var(--ink)]',
        ].join(' ')}
      >
        <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: isUnlabeledCredit ? 'var(--positive)' : color }} />
        {isUnlabeledCredit ? 'Label reimbursement…' : label}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1.5 left-0 w-56 bg-white border border-[var(--hairline)] rounded-[14px] shadow-lg p-2">
          {/* Search */}
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or create…"
            className="w-full px-2.5 py-1.5 text-[13px] border border-[var(--hairline)] rounded-[8px] mb-1.5 outline-none focus:border-[var(--accent-dark)] bg-[var(--canvas)]"
          />

          {/* Credit hint */}
          {isCredit && (
            <p className="text-[11px] text-[var(--positive)] px-1 pb-1.5">
              Deducted from the chosen category
            </p>
          )}

          {/* Category list */}
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.map((c) => {
              const clr = getCategoryColor(c)
              return (
                <button
                  key={c}
                  onClick={() => handleSelect(c)}
                  className={[
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[13px] text-left hover:bg-[#f5f2ec] transition-colors',
                    c === category ? 'bg-[#f0ede5] font-medium' : '',
                  ].join(' ')}
                >
                  <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: clr }} />
                  {getCategoryLabel(c)}
                </button>
              )
            })}
            {showCreate && (
              <button
                onClick={() => handleSelect(slugifyCategory(search))}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] text-[13px] text-left hover:bg-[#f5f2ec] text-[var(--accent-dark)] font-medium"
              >
                <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: hashCategoryColor(search) }} />
                Create "{search}"
              </button>
            )}
          </div>

          {/* Apply-to-all toggle (only when merchant exists) */}
          {merchantName && (
            <div className="mt-2 pt-2 border-t border-[var(--hairline)]">
              <label className="flex items-center gap-2 text-[12px] text-[var(--muted-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="accent-[var(--accent-dark)]"
                />
                Apply to all "{merchantName}"
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
