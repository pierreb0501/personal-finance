'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, TrendingUp, CreditCard, Calendar, BarChart2, Target } from 'lucide-react'

const TABS = [
  { label: 'Overview',    href: '/',            icon: LayoutGrid },
  { label: 'Spending',    href: '/spending',    icon: CreditCard },
  { label: 'Calendar',    href: '/calendar',    icon: Calendar },
  { label: 'Budget',      href: '/budget',      icon: Target },
  { label: 'Invest',      href: '/investments', icon: BarChart2 },
]

export function ClientMobileTabBar() {
  const pathname = usePathname()
  return (
    <>
      {TABS.map(({ label, href, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={[
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
              active ? 'text-[var(--accent-dark)]' : 'text-[var(--faint)]',
            ].join(' ')}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.6} />
            {label}
          </Link>
        )
      })}
    </>
  )
}
