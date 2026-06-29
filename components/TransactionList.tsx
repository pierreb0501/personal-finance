'use client'

import { useState, useMemo } from 'react'
import { TransactionRow } from '@/components/TransactionRow'
import { Search, ArrowLeftRight } from 'lucide-react'
import { getCategoryColor, getCategoryLabel, CARD_PAYMENT_CATEGORY, CARD_PAYMENT_LABEL } from '@/lib/categories'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  rawName?: string | null
  category: string
  customCategory: string | null
  pending: number
  ignored: number
  spreadMonths?: number | null
  isCardPayment?: boolean
}

type Props = {
  transactions: Transaction[]
  rules: CategoryRule[]
  knownCustomCategories: string[]
  recurringMerchantNames?: Set<string>
}

export function TransactionList({ transactions, rules, knownCustomCategories, recurringMerchantNames }: Props) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const categories = useMemo(() => {
    const seen = new Map<string, number>()
    for (const tx of transactions) {
      // Card payments are grouped under one synthetic chip, not their raw
      // Plaid category (Income / Loan payments / …), so they appear in exactly
      // one place.
      const cat = tx.isCardPayment ? CARD_PAYMENT_CATEGORY : tx.category
      seen.set(cat, (seen.get(cat) ?? 0) + 1)
    }
    const list = Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }))
    // The active filter persists across month navigation, but its chip only
    // renders if this month has matching transactions. Always include it as a
    // dimmed "ghost" chip (count 0) so the filter is never stuck and
    // undismissable in a month that lacks that category.
    if (activeCategory && !seen.has(activeCategory)) {
      list.push({ cat: activeCategory, count: 0 })
    }
    return list
  }, [transactions, activeCategory])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions.filter((tx) => {
      const matchesQuery = !q || tx.merchantName?.toLowerCase().includes(q)
      const matchesCategory =
        !activeCategory ||
        (activeCategory === CARD_PAYMENT_CATEGORY
          ? Boolean(tx.isCardPayment)
          : tx.category === activeCategory && !tx.isCardPayment)
      return matchesQuery && matchesCategory
    })
  }, [transactions, query, activeCategory])

  const isFiltered = query.trim() || activeCategory

  return (
    <div>
      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search merchants…"
          className="w-full pl-8 pr-3 py-2 text-[13px] bg-[var(--bg)] border border-[var(--hairline)] rounded-[10px] text-[var(--ink)] placeholder:text-[var(--faint)] focus:outline-none focus:ring-1 focus:ring-[var(--ink)] focus:ring-opacity-20"
        />
      </div>

      {/* Category chips */}
      {(categories.length > 1 || (categories.length === 1 && categories[0].count === 0)) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {categories.map(({ cat, count }) => {
            const active = activeCategory === cat
            const ghost = count === 0
            const isCardPay = cat === CARD_PAYMENT_CATEGORY
            const color = getCategoryColor(cat)
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(active ? null : cat)}
                className={[
                  'flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors border',
                  active
                    ? 'text-white border-transparent'
                    : ghost
                      ? 'bg-white text-[var(--faint)] border-dashed border-[var(--hairline)] hover:border-current'
                      : 'bg-white text-[var(--muted-text)] border-[var(--hairline)] hover:border-current',
                ].join(' ')}
                style={active ? { background: color, borderColor: color } : { '--hover-color': color } as React.CSSProperties}
              >
                {isCardPay && <ArrowLeftRight size={11} className="shrink-0" />}
                {isCardPay ? CARD_PAYMENT_LABEL : getCategoryLabel(cat)}
                {ghost && <span className="opacity-70">· 0</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--faint)] text-center py-6">No transactions match the current filters</p>
      ) : (
        <div>
          {filtered.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              rules={rules}
              knownCustomCategories={knownCustomCategories}
              isRecurring={tx.merchantName ? recurringMerchantNames?.has(tx.merchantName) : false}
            />
          ))}
          {isFiltered && filtered.length < transactions.length && (
            <p className="text-[12px] text-[var(--faint)] text-center pt-3">
              Showing {filtered.length} of {transactions.length} transactions
            </p>
          )}
        </div>
      )}
    </div>
  )
}
