'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid,
  TrendingUp,
  CreditCard,
  Calendar,
  BarChart2,
  Target,
  Tag,
  Repeat2,
  Landmark,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Overview',    href: '/',            icon: LayoutGrid },
  { label: 'Net Worth',   href: '/net-worth',   icon: TrendingUp },
  { label: 'Spending',    href: '/spending',    icon: CreditCard },
  { label: 'Calendar',    href: '/calendar',    icon: Calendar },
  { label: 'Recurring',   href: '/recurring',   icon: Repeat2 },
  { label: 'Budget',      href: '/budget',      icon: Target },
  { label: 'Investments', href: '/investments', icon: BarChart2 },
  { label: 'Categories',  href: '/categories',  icon: Tag },
  { label: 'Accounts',    href: '/accounts',    icon: Landmark },
]

export function NavLinks() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex items-center gap-3 px-3 py-2.5 rounded-[11px] text-[14.5px] font-medium transition-colors',
              active
                ? 'bg-[var(--accent-dark)] text-white'
                : 'text-[var(--muted-text)] hover:bg-[#efece4] hover:text-[var(--ink)]',
            ].join(' ')}
          >
            <Icon size={18} strokeWidth={1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
