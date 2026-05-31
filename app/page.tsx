import Link from 'next/link'
import { db } from '@/lib/db'
import {
  getLatestSnapshot,
  getSnapshotHistory,
  getMonthlySpend,
  getCategoryBreakdown,
  getAllHoldings,
} from '@/lib/db/queries'
import { NetWorthCard } from '@/components/NetWorthCard'
import { MonthlySpendCard } from '@/components/MonthlySpendCard'
import { CategoryBreakdownCard } from '@/components/CategoryBreakdownCard'
import { InvestmentsCard } from '@/components/InvestmentsCard'
import { buttonVariants } from '@/components/ui/button'
import SyncButton from '@/components/SyncButton'

export default function DashboardPage() {
  const latest = getLatestSnapshot(db)
  const history = getSnapshotHistory(db, 30)
  const monthlySpend = getMonthlySpend(db)
  const categories = getCategoryBreakdown(db)
  const holdings = getAllHoldings(db)

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Personal Finance</h1>
          <div className="flex gap-2">
            <Link
              href="/connect"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              + Add account
            </Link>
            <SyncButton />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NetWorthCard latest={latest} history={history} />
          <MonthlySpendCard total={monthlySpend} />
          <CategoryBreakdownCard categories={categories} />
          <InvestmentsCard holdings={holdings} />
        </div>
      </div>
    </main>
  )
}
