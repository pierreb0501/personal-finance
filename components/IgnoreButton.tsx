'use client'

import { useState } from 'react'
import { EyeOff, Eye } from 'lucide-react'
import { toggleIgnoreTransaction } from '@/app/actions'

export function IgnoreButton({ txId, ignored }: { txId: string; ignored: boolean }) {
  const [pending, setPending] = useState(false)

  async function handle() {
    setPending(true)
    await toggleIgnoreTransaction(txId, !ignored)
    setPending(false)
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      title={ignored ? 'Un-ignore transaction' : 'Ignore transaction'}
      className={[
        'p-1.5 rounded-[7px] transition-colors cursor-pointer',
        ignored
          ? 'text-[var(--accent-dark)] hover:bg-[#e6f1ea]'
          : 'text-[var(--faint)] hover:text-[var(--muted-text)] hover:bg-[#f0ede5]',
      ].join(' ')}
    >
      {ignored ? <Eye size={14} /> : <EyeOff size={14} />}
    </button>
  )
}
