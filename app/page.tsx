import Link from 'next/link'
import { db } from '@/lib/db'
import {
  getLatestSnapshot,
  getAllSnapshotHistory,
  getMonthlySpend,
  getCategoryBreakdown,
  getAllHoldings,
  getRecentTransactions,
  getSetting,
  getAllAccounts,
  getUnlabeledTransfers,
  getCreditCardBalances,
  getKnownCategories,
} from '@/lib/db/queries'
import { getCategoryColor, getCategoryLabel, PALETTE } from '@/lib/categories'
import { formatCAD } from '@/lib/format'
import SyncButton from '@/components/SyncButton'
import { NetWorthHeroCard } from '@/components/NetWorthHeroCard'
import { ProgressBar } from '@/components/ProgressBar'
import { DonutChart } from '@/components/DonutChart'
import { TransactionRow } from '@/components/TransactionRow'
import { EmptyState } from '@/components/EmptyState'
import { Card } from '@/components/Card'
import { PlusIcon, ArrowRight, TriangleAlert } from 'lucide-react'

export const dynamic = 'force-dynamic'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default async function OverviewPage() {
  const latest = await getLatestSnapshot(db)
  const history = await getAllSnapshotHistory(db)
  const monthlySpend = await getMonthlySpend(db)
  const allowance = Number((await getSetting(db, 'allowance')) ?? '3000')
  const income = Number((await getSetting(db, 'income')) ?? '0')
  const categories = await getCategoryBreakdown(db)
  const holdings = await getAllHoldings(db)
  const transactions = await getRecentTransactions(db, 4)
  const { rules, knownCustomCategories } = await getKnownCategories(db)
  const accounts = await getAllAccounts(db)
  const unlabeledTransfers = await getUnlabeledTransfers(db)
  const cardBalances = await getCreditCardBalances(db)
  const totalOwed = cardBalances.reduce((s, c) => s + c.balance, 0)

  const spendRatio = allowance > 0 ? monthlySpend / allowance : 0
  const remaining = allowance - monthlySpend
  const savingsRate = income > 0 ? ((income - monthlySpend) / income) * 100 : null

  // Allocation donut: by account type
  const investmentsVal = latest?.investmentsValue ?? 0
  const allAccountsTotal = accounts.reduce((s, a) => s + Math.abs(a.balanceCurrent), 0)
  const cashVal = accounts
    .filter((a) => a.type === 'depository')
    .reduce((s, a) => s + a.balanceCurrent, 0)
  const liabVal = accounts
    .filter((a) => a.type === 'credit' || a.type === 'loan')
    .reduce((s, a) => s + a.balanceCurrent, 0)
  const otherVal = Math.max(0, allAccountsTotal - investmentsVal - cashVal - liabVal)

  const allocationSegments = [
    { label: 'Investments', value: investmentsVal, color: PALETTE[0] },
    { label: 'Cash', value: cashVal, color: PALETTE[3] },
    { label: 'Liabilities', value: liabVal, color: PALETTE[2] },
    { label: 'Other', value: otherVal, color: PALETTE[6] },
  ].filter((s) => s.value > 0)

  // Today's investments delta (last 2 snapshots)
  const prevSnapshot = history.length >= 2 ? history[history.length - 2] : null
  const investDelta = prevSnapshot ? investmentsVal - prevSnapshot.investmentsValue : null

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[1100px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-7">
        <div>
          <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
            {greeting()}, Pierre
          </h1>
          <p className="text-[14px] text-[var(--muted-text)] mt-1">{formatDate()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/connect"
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-[var(--muted-text)] bg-white border border-[var(--hairline)] rounded-[10px] hover:bg-[#f5f2ec] transition-colors"
          >
            <PlusIcon size={13} />
            Add account
          </Link>
          <SyncButton />
        </div>
      </div>

      {/* Unlabeled transfers alert */}
      {unlabeledTransfers.length > 0 && (
        <Link
          href="/spending"
          className="flex items-center gap-2.5 px-4 py-3 mb-[18px] bg-[#fdf6e3] border border-[#e8d89a] rounded-[14px] hover:bg-[#faf0cc] transition-colors"
        >
          <TriangleAlert size={14} className="text-[#b08a00] shrink-0" />
          <p className="text-[13px] font-semibold text-[#7a5f00]">
            {unlabeledTransfers.length === 1
              ? '1 transfer this month needs labeling'
              : `${unlabeledTransfers.length} transfers this month need labeling`}
          </p>
          <ArrowRight size={13} className="text-[#b08a00] ml-auto shrink-0" />
        </Link>
      )}

      {/* Row 1: Net worth hero + This month */}
      <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: '1.6fr 1fr' }}>
        <NetWorthHeroCard latest={latest} history={history} />

        {/* This Month + Investments */}
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">This month</p>
          <p className="font-bold text-[30px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
            {formatCAD(monthlySpend)}
          </p>
          <p className="text-[13px] text-[var(--muted-text)] mt-1">of {formatCAD(allowance)} allowance</p>
          <ProgressBar value={spendRatio} className="mt-3.5" />
          <div className="flex justify-between text-[13px] text-[var(--muted-text)] mt-2">
            <span>{Math.round(spendRatio * 100)}% used</span>
            <span className={remaining < 0 ? 'text-[var(--negative)] font-semibold' : ''}>
              {remaining >= 0 ? formatCAD(remaining) : `-${formatCAD(Math.abs(remaining))}`} left
            </span>
          </div>
          {savingsRate !== null && (
            <div className={[
              'inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full mt-3',
              savingsRate >= 0 ? 'bg-[#e6f1ea] text-[var(--positive)]' : 'bg-[#f6e8e4] text-[var(--negative)]',
            ].join(' ')}>
              {savingsRate >= 0 ? '▲' : '▼'} {savingsRate >= 0 ? '+' : ''}{savingsRate.toFixed(1)}% savings rate
            </div>
          )}

          <hr className="border-[var(--hairline)] my-4" />

          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-[var(--faint)]">Investments</p>
          <p className="font-bold text-[24px] tracking-tight tabular-nums leading-none mt-2 text-[var(--ink)]">
            {latest ? formatCAD(latest.investmentsValue) : '—'}
          </p>
          {investDelta !== null && (
            <span
              className={[
                'inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full mt-2',
                investDelta >= 0 ? 'bg-[#e6f1ea] text-[var(--positive)]' : 'bg-[#f6e8e4] text-[var(--negative)]',
              ].join(' ')}
            >
              {investDelta >= 0 ? '▲' : '▼'} {investDelta >= 0 ? '+' : ''}{formatCAD(investDelta)} today
            </span>
          )}
        </Card>
      </div>

      {/* Card balances */}
      {cardBalances.length > 0 && (
        <Card className="mb-[18px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
                Card balances
              </h3>
              <p className="text-[13px] text-[var(--muted-text)] mt-0.5">What you currently owe</p>
            </div>
            <p className="font-bold text-[24px] tracking-tight tabular-nums leading-none text-[var(--negative)]">
              {formatCAD(totalOwed)}
            </p>
          </div>
          <div className="space-y-2.5">
            {cardBalances.map((c) => (
              <div key={c.label} className="flex items-center justify-between text-[13px]">
                <span className="font-medium text-[var(--ink)]">{c.label}</span>
                <span className="font-semibold tabular-nums text-[var(--negative)]">{formatCAD(c.balance)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Row 2: Allocation donut + Recent activity */}
      <div className="grid gap-[18px]" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        {/* Allocation */}
        <Card>
          <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
            Allocation
          </h3>
          <p className="text-[13px] text-[var(--muted-text)] mt-0.5 mb-4">Where your money sits</p>
          {allocationSegments.length > 0 ? (
            <DonutChart segments={allocationSegments} />
          ) : (
            <EmptyState message="Connect accounts to see allocation" />
          )}
        </Card>

        {/* Recent activity */}
        <Card>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-[family-name:var(--font-fraunces)] font-normal text-[19px] text-[var(--ink)]">
              Recent activity
            </h3>
            <Link
              href="/spending"
              className="flex items-center gap-1 text-[13px] text-[var(--muted-text)] hover:text-[var(--ink)] transition-colors"
            >
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {transactions.length === 0 ? (
            <EmptyState message="No recent transactions" subMessage="Sync your accounts to see activity" />
          ) : (
            <div>
              {transactions.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  rules={rules}
                  knownCustomCategories={knownCustomCategories}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
