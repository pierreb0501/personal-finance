'use client'

import { useState, useMemo } from 'react'
import { TransactionRow } from '@/components/TransactionRow'
import { Search } from 'lucide-react'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory: string | null
  pending: number
  ignored: number
}

type Props = {
  transactions: Transaction[]
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

export function TransactionList({ transactions, rules, knownCustomCategories }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return transactions
    return transactions.filter(
      (tx) => tx.merchantName?.toLowerCase().includes(q)
    )
  }, [transactions, query])

  return (
    <div>
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants…"
          className="w-full pl-8 pr-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--faint)] text-center py-6">No transactions match &ldquo;{query}&rdquo;</p>
      ) : (
        <div>
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              rules={rules}
              knownCustomCategories={knownCustomCategories}
            />
          ))}
          {query && filtered.length < transactions.length && (
            <p className="text-[12px] text-[var(--faint)] text-center pt-3">
              Showing {filtered.length} of {transactions.length} transactions
            </p>
          )}
        </div>
      )}
    </div>
  )
}
