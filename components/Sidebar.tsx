import { LogOut } from 'lucide-react'
import { NavLinks } from './NavLinks'
import { SyncStatus } from './SyncStatus'
import { logout } from '@/app/login/actions'

export function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[248px] shrink-0 flex-col bg-[var(--surface-warm)] border-r border-[var(--hairline)] h-screen sticky top-0 px-[18px] py-[26px]">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-2.5 pb-[22px]">
          <span className="w-[30px] h-[30px] rounded-[9px] bg-[#1a7a4a] flex items-center justify-center text-white font-bold text-[18px]">
            $
          </span>
          <span className="font-[family-name:var(--font-fraunces)] font-medium text-[19px] tracking-tight">
            Personal Finance
          </span>
        </div>

        {/* Nav */}
        <NavLinks />

        {/* Footer */}
        <div className="mt-auto border-t border-[var(--hairline)] pt-3.5 space-y-3">
          <SyncStatus />
          <div className="flex items-center gap-2.5">
            <span className="w-[34px] h-[34px] rounded-full bg-[#dfece5] text-[var(--accent-dark)] flex items-center justify-center font-bold text-[13px]">
              PE
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold leading-tight">Pierre E.</p>
              <p className="text-[12px] text-[var(--faint)]">Personal</p>
            </div>
            <form action={logout}>
              <button
                type="submit"
                title="Sign out"
                className="p-1.5 rounded-[8px] text-[var(--faint)] hover:text-[var(--negative)] hover:bg-[#f6e8e4] transition-colors cursor-pointer"
              >
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex bg-[var(--surface-warm)] border-t border-[var(--hairline)] px-2 pb-safe">
        <MobileTabBar />
      </nav>
    </>
  )
}

function MobileTabBar() {
  return <ClientMobileTabBar />
}

// Import lazily to keep Sidebar as Server Component
import { ClientMobileTabBar } from './ClientMobileTabBar'
