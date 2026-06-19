'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

type Status =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; imported: number; skipped: number }
  | { type: 'error'; message: string }

export default function AmexImportButton() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  async function handleFile(file: File) {
    setStatus({ type: 'loading' })
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/import/amex', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) {
        setStatus({ type: 'error', message: json.error ?? 'Import failed' })
        return
      }
      setStatus({ type: 'success', imported: json.imported, skipped: json.skipped })
      router.refresh()
      setTimeout(() => setStatus({ type: 'idle' }), 4000)
    } catch {
      setStatus({ type: 'error', message: 'Network error' })
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const loading = status.type === 'loading'

  return (
    <div className="flex items-center gap-2">
      {status.type === 'success' && (
        <span className="flex items-center gap-1 text-[12px] text-emerald-600">
          <CheckCircle2 size={12} />
          {status.imported} imported{status.skipped > 0 ? `, ${status.skipped} dupes skipped` : ''}
        </span>
      )}
      {status.type === 'error' && (
        <span className="flex items-center gap-1 text-[12px] text-red-500">
          <AlertCircle size={12} />
          {status.message}
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={onChange}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="gap-1.5 cursor-pointer text-[var(--muted-text)]"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        Import Amex CSV
      </Button>
    </div>
  )
}
