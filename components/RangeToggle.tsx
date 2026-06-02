'use client'

type Props = {
  options: string[]
  value: string
  onChange: (v: string) => void
}

export function RangeToggle({ options, value, onChange }: Props) {
  return (
    <div className="inline-flex bg-[#f0ede5] rounded-[10px] p-[3px] gap-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={[
            'text-[12.5px] font-semibold px-3 py-[5px] rounded-[8px] cursor-pointer transition-all',
            opt === value
              ? 'bg-white text-[var(--ink)] shadow-[0_1px_2px_rgba(0,0,0,.06)]'
              : 'text-[var(--muted-text)] hover:text-[var(--ink)]',
          ].join(' ')}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
