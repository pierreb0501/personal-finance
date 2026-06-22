export const PALETTE = [
  '#3B82F6', // c1 — blue
  '#EF4444', // c2 — red
  '#10B981', // c3 — emerald
  '#F59E0B', // c4 — amber
  '#8B5CF6', // c5 — violet
  '#EC4899', // c6 — pink
  '#06B6D4', // c7 — cyan
  '#F97316', // c8 — orange
  '#14B8A6', // c9 — teal
  '#84CC16', // c10 — lime
] as const

export const PALETTE_FALLBACK = '#94A3B8'

export const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK:       'Food & Drink',
  GENERAL_MERCHANDISE:  'Shopping',
  TRANSPORTATION:       'Transport',
  ENTERTAINMENT:        'Entertainment',
  RENT_AND_UTILITIES:   'Bills & Utilities',
  LOAN_PAYMENTS:        'Loan Payments',
  GENERAL_SERVICES:     'Services',
  PERSONAL_CARE:        'Personal Care',
  MEDICAL:              'Medical',
  TRAVEL:               'Travel',
  TRANSFER_IN:          'Transfer In',
  TRANSFER_OUT:         'Transfer Out',
  INCOME:               'Income',
  OTHER:                'Other',
}

export const CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK:       PALETTE[0],  // blue
  GENERAL_MERCHANDISE:  PALETTE[3],  // amber
  TRANSPORTATION:       PALETTE[6],  // cyan
  ENTERTAINMENT:        PALETTE[4],  // violet
  RENT_AND_UTILITIES:   PALETTE[8],  // teal
  LOAN_PAYMENTS:        PALETTE[1],  // red
  GENERAL_SERVICES:     PALETTE[7],  // orange
  PERSONAL_CARE:        PALETTE[5],  // pink
  MEDICAL:              PALETTE[1],  // red
  TRAVEL:               PALETTE[9],  // lime
  TRANSFER_IN:          PALETTE[2],  // emerald
  TRANSFER_OUT:         PALETTE[7],  // orange
  INCOME:               PALETTE[2],  // emerald
  OTHER:                PALETTE_FALLBACK,
}

export function hashCategoryColor(name: string): string {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return PALETTE[sum % PALETTE.length]
}

export function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? hashCategoryColor(category)
}

export function getCategoryLabel(category: string): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]
  return category
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export type CategoryRule = {
  id: string
  merchantName: string
  category: string
  createdAt: number
}

export function applyCategoryRules<
  T extends { merchantName: string | null; category: string; customCategory?: string | null },
>(txns: T[], rules: CategoryRule[]): T[] {
  const ruleMap = new Map(rules.map((r) => [r.merchantName, r.category]))
  return txns.map((tx) => {
    if (tx.customCategory) return { ...tx, category: tx.customCategory }
    if (tx.merchantName && ruleMap.has(tx.merchantName)) {
      return { ...tx, category: ruleMap.get(tx.merchantName)! }
    }
    return tx
  })
}

// Canonical identifier form for a user-typed category name, matching the
// BUILT_IN_STYLE used by Plaid's own categories (e.g. FOOD_AND_DRINK) so
// custom categories created through different UI entry points (the category
// manager, or "Create new" inline on a transaction) always collide into the
// same identifier instead of silently forking into two categories.
export function slugifyCategory(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '')
}
