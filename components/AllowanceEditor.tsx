'use client'

import { useState, useRef } from 'react'
import { saveAllowance } from '@/app/actions'
import { formatCAD } from '@/lib/format'

export function AllowanceEditor({ allowance }: { allowance: number }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(allowance))
  const [current, setCurrent] = useState(allowance)
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
      await saveAllowance(parsed)
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

  return (
    <button
      onClick={startEdit}
      className="text-left group cursor-pointer"
      title="Click to edit"
    >
      <p className="font-bold text-[30px] tracking-tight tabular-nums text-[var(--ink)] group-hover:text-[var(--accent-dark)] transition-colors">
        {formatCAD(current)}
      </p>
      <p className="text-[12px] text-[var(--faint)] mt-0.5 group-hover:text-[var(--accent-soft)] transition-colors">
        ✎ Monthly spending limit (discretionary)
      </p>
    </button>
  )
}
