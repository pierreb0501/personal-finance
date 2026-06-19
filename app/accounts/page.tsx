import { db } from '@/lib/db'
import { getAllItemsWithAccounts } from '@/lib/db/queries'
import { AccountManager } from '@/components/AccountManager'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const items = await getAllItemsWithAccounts(db)

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[900px]">
      <div className="mb-7">
        <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
          Accounts
        </h1>
        <p className="text-[14px] text-[var(--muted-text)] mt-1">
          Manage your connected bank and credit card accounts
        </p>
      </div>

      <AccountManager items={items} />
    </div>
  )
}
