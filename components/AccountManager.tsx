'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trash2, Plus, AlertTriangle, Loader2 } from 'lucide-react'
import { removeAccount } from '@/app/actions'

type Account = {
  id: string
  name: string
  type: string
  subtype: string
  balanceCurrent: number
  isoCurrencyCode: string
}

type Item = {
  id: string
  institutionName: string
  status: string
  accounts: Account[]
}

function formatBalance(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount)
}

export function AccountManager({ items: initialItems }: { items: Item[] }) {
  const [items, setItems] = useState(initialItems)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(itemId: string, accountId: string) {
    setDeletingId(accountId)
    await removeAccount(accountId)
    setItems((prev) =>
      prev
        .map((it) =>
          it.id === itemId
            ? { ...it, accounts: it.accounts.filter((a) => a.id !== accountId) }
            : it,
        )
        .filter((it) => it.accounts.length > 0),
    )
    setDeletingId(null)
    setConfirmingId(null)
  }

  return (
    <div className="space-y-[18px]">
      <div className="bg-white rounded-[18px] border border-[var(--hairline)] px-6 card-shadow card-rise">
        <div className="flex items-center justify-between py-5 border-b border-[var(--hairline)]">
          <div>
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              Connected accounts
            </h3>
            <p className="text-[12px] text-[var(--faint)] mt-0.5">
              Removing an account deletes its transaction history from this app
            </p>
          </div>
          <Link
            href="/connect"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--accent-dark)] text-white text-[14px] font-semibold rounded-[10px] hover:opacity-90 transition-opacity cursor-pointer shrink-0"
          >
            <Plus size={14} />
            Connect
          </Link>
        </div>

        {items.length === 0 && (
          <p className="py-8 text-center text-[13px] text-[var(--faint)]">No accounts connected.</p>
        )}

        {items.map((item) => (
          <div key={item.id} className="py-4 border-b border-[var(--hairline)] last:border-0">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-[13px] font-semibold text-[var(--ink)]">{item.institutionName}</span>
              {item.status === 'login_required' && (
                <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <AlertTriangle size={10} />
                  Needs reconnect
                </span>
              )}
            </div>

            {item.accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between py-2.5 pl-1"
              >
                <div>
                  <p className="text-[14px] font-medium text-[var(--ink)]">{account.name}</p>
                  <p className="text-[12px] text-[var(--faint)] capitalize">
                    {account.subtype} · {formatBalance(account.balanceCurrent, account.isoCurrencyCode)}
                  </p>
                </div>

                {confirmingId === account.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--muted-text)]">Remove this account?</span>
                    <button
                      onClick={() => handleDelete(item.id, account.id)}
                      disabled={deletingId === account.id}
                      className="text-[12px] font-semibold text-white bg-[var(--negative)] rounded-[8px] px-3 py-1.5 hover:opacity-90 disabled:opacity-60 cursor-pointer"
                    >
                      {deletingId === account.id ? (
                        <Loader2 size={12} className="inline animate-spin mr-1" />
                      ) : null}
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={deletingId === account.id}
                      className="text-[12px] font-medium text-[var(--muted-text)] hover:text-[var(--ink)] px-2 py-1.5 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(account.id)}
                    className="text-[var(--faint)] hover:text-[var(--negative)] transition-colors cursor-pointer"
                    title="Remove account"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
