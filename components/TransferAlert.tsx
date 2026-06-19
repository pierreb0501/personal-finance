'use client'

import { TriangleAlert } from 'lucide-react'
import { TransactionRow } from './TransactionRow'
import type { CategoryRule } from '@/lib/categories'

type Transaction = {
  id: string
  amount: number
  date: string
  merchantName: string | null
  category: string
  customCategory?: string | null
  ignored?: number
}

type Props = {
  transfers: Transaction[]
  rules: CategoryRule[]
  knownCustomCategories: string[]
}

export function TransferAlert({ transfers, rules, knownCustomCategories }: Props) {
  if (transfers.length === 0) return null

  return (
    <div className="bg-[#fdf6e3] border border-[#e8d89a] rounded-[18px] px-6 py-5 mb-[18px]">
      <div className="flex items-center gap-2 mb-3">
        <TriangleAlert size={15} className="text-[#b08a00] shrink-0" />
        <p className="text-[13px] font-semibold text-[#7a5f00]">
          {transfers.length === 1
            ? '1 transfer needs labeling'
            : `${transfers.length} transfers need labeling`}
        </p>
        <p className="text-[12px] text-[#a08020] ml-1">— click the category to assign one</p>
      </div>
      <div className="bg-white rounded-[12px] border border-[#e8d89a] px-4">
        {transfers.map((tx) => (
          <TransactionRow
            key={tx.id}
            tx={tx}
            rules={rules}
            knownCustomCategories={knownCustomCategories}
          />
        ))}
      </div>
    </div>
  )
}
