'use client'

import { useState } from 'react'
import { setCategoryKind } from '@/app/actions'
import type { CategoryKind } from '@/lib/db/queries'

type Props = {
  category: string
  kind: CategoryKind
}

const OPTIONS: { value: CategoryKind; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'flexible', label: 'Flexible' },
  { value: 'savings', label: 'Savings' },
]

export function CategoryKindToggle({ category, kind: initialKind }: Props) {
  const [kind, setKind] = useState<CategoryKind>(initialKind)
  const [saving, setSaving] = useState(false)

  async function handleSelect(next: CategoryKind) {
    if (next === kind || saving) return
    setKind(next)
    setSaving(true)
    await setCategoryKind(category, next)
    setSaving(false)
  }

  return (
    <div className="inline-flex items-center gap-[2px] bg-[#eee9df] rounded-[8px] p-[3px]">
      {OPTIONS.map((opt) => {
        const active = opt.value === kind
        return (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            disabled={saving}
            className={[
              'px-2 py-[2px] rounded-[6px] text-[11px] font-medium transition-colors leading-tight cursor-pointer',
              active
                ? 'bg-white text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-[var(--muted-text)] hover:text-[var(--ink)]',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
