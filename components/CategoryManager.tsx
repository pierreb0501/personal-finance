'use client'

import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { getCategoryColor, getCategoryLabel, PALETTE } from '@/lib/categories'
import { addCustomCategory, deleteCustomCategory } from '@/app/actions'

type CustomCategory = {
  id: string
  name: string
  color: string | null
  createdAt: number
}

type BuiltinCategory = {
  key: string
  label: string
}

type Props = {
  builtins: BuiltinCategory[]
  customs: CustomCategory[]
}

export function CategoryManager({ builtins, customs: initialCustoms }: Props) {
  const [customs, setCustoms] = useState(initialCustoms)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(PALETTE[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    if (customs.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('A category with that name already exists.')
      return
    }
    setSaving(true)
    setError('')
    await addCustomCategory(trimmed, newColor)
    setCustoms((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, name: trimmed, color: newColor, createdAt: Date.now() },
    ].sort((a, b) => a.name.localeCompare(b.name)))
    setNewName('')
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await deleteCustomCategory(id)
    setCustoms((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="space-y-[18px]">
      {/* Add new custom category */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] p-6 card-shadow card-rise">
        <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)] mb-4">
          Add category
        </h3>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] block mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => { setNewName(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              placeholder="e.g. Rent, Subscriptions…"
              className="w-full text-[14px] border border-[var(--hairline)] rounded-[10px] px-3 py-2.5 bg-[var(--canvas)] text-[var(--ink)] outline-none focus:border-[var(--accent-dark)]"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)] block mb-1.5">
              Color
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-6 h-6 rounded-[6px] transition-transform hover:scale-110 cursor-pointer"
                  style={{
                    backgroundColor: c,
                    outline: newColor === c ? `2.5px solid ${c}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={!newName.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent-dark)] text-white text-[14px] font-semibold rounded-[10px] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
        {error && <p className="text-[12px] text-[var(--negative)] mt-2">{error}</p>}
      </div>

      {/* Custom categories */}
      {customs.length > 0 && (
        <div className="bg-white rounded-[18px] border border-[var(--hairline)] px-6 card-shadow card-rise">
          <div className="py-5 border-b border-[var(--hairline)]">
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              Custom categories
            </h3>
            <p className="text-[12px] text-[var(--faint)] mt-0.5">Created by you — can be deleted</p>
          </div>
          {customs.map((cat) => {
            const color = cat.color ?? getCategoryColor(cat.name)
            return (
              <div key={cat.id} className="flex items-center justify-between py-3.5 border-b border-[var(--hairline)] last:border-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[14px] font-semibold text-[var(--ink)]">{cat.name}</span>
                </div>
                <button
                  onClick={() => handleDelete(cat.id)}
                  className="text-[var(--faint)] hover:text-[var(--negative)] transition-colors cursor-pointer"
                  title="Delete category"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Built-in categories */}
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] px-6 card-shadow card-rise">
        <div className="py-5 border-b border-[var(--hairline)]">
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Built-in categories
          </h3>
          <p className="text-[12px] text-[var(--faint)] mt-0.5">Assigned automatically by Plaid — cannot be removed</p>
        </div>
        {builtins.map((cat) => {
          const color = getCategoryColor(cat.key)
          return (
            <div key={cat.key} className="flex items-center gap-2.5 py-3.5 border-b border-[var(--hairline)] last:border-0">
              <span className="w-[9px] h-[9px] rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[14px] font-medium text-[var(--ink)]">{cat.label}</span>
              <span className="text-[12px] text-[var(--faint)] ml-auto">{cat.key}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
