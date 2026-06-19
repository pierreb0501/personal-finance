import { db } from '@/lib/db'
import { getCustomCategories } from '@/lib/db/queries'
import { CATEGORY_LABELS, getCategoryLabel } from '@/lib/categories'
import { CategoryManager } from '@/components/CategoryManager'

export const dynamic = 'force-dynamic'

export default async function CategoriesPage() {
  const customs = await getCustomCategories(db)

  const builtins = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }))

  return (
    <div className="px-8 md:px-11 py-9 pb-24 md:pb-9 max-w-[900px]">
      <div className="mb-7">
        <h1 className="font-[family-name:var(--font-fraunces)] font-normal text-[30px] tracking-tight text-[var(--ink)]">
          Categories
        </h1>
        <p className="text-[14px] text-[var(--muted-text)] mt-1">
          Manage custom categories for transactions and budgets
        </p>
      </div>

      <CategoryManager builtins={builtins} customs={customs} />
    </div>
  )
}
