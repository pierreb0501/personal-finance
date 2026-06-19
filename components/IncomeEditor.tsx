'use client'

import { useState, useRef } from 'react'
import { saveIncome } from '@/app/actions'
import { formatCAD } from '@/lib/format'

export function IncomeEditor({ income }: { income: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(income))
  const [current, setCurrent] = useState(income)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setValue(String(current))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commit() {
    const parsed = parseFloat(value.replace(/[^0-9.]/g, ''))
    if (!isNaN(parsed) && parsed > 0) {
      setCurrent(parsed)
      await saveIncome(parsed)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="font-bold text-[30px] tracking-tight tabular-nums w-full bg-transparent border-b-2 border-[var(--accent-dark)] outline-none text-[var(--ink)]"
        min={0}
        autoFocus
      />
    )
  }

  if (current === 0) {
    return (
      <button onClick={startEdit} className="text-left group cursor-pointer">
        <p className="font-bold text-[30px] tracking-tight tabular-nums text-[var(--faint)] group-hover:text-[var(--accent-dark)] transition-colors">
          —
        </p>
        <p className="text-[12px] text-[var(--faint)] mt-0.5 group-hover:text-[var(--accent-soft)] transition-colors">
          ✎ Set income
        </p>
      </button>
    )
  }

  return (
    <button onClick={startEdit} className="text-left group cursor-pointer" title="Click to edit">
      <p className="font-bold text-[30px] tracking-tight tabular-nums text-[var(--ink)] group-hover:text-[var(--accent-dark)] transition-colors">
        {formatCAD(current)}
      </p>
      <p className="text-[12px] text-[var(--faint)] mt-0.5 group-hover:text-[var(--accent-soft)] transition-colors">
        ✎ Tap to edit
      </p>
    </button>
  )
}
