export const PALETTE = [
  '#2E7D5B', // c1 — evergreen
  '#C8923B', // c2 — amber
  '#B5503C', // c3 — clay
  '#4A6B8A', // c4 — slate blue
  '#7A5A78', // c5 — plum
  '#8AA17E', // c6 — sage
  '#C9A66B', // c7 — sand
  '#4E8C86', // c8 — teal
] as const

export const PALETTE_FALLBACK = '#A8A39A'

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
  FOOD_AND_DRINK:       PALETTE[0],
  GENERAL_MERCHANDISE:  PALETTE[6],
  TRANSPORTATION:       PALETTE[3],
  ENTERTAINMENT:        PALETTE[4],
  RENT_AND_UTILITIES:   PALETTE[7],
  LOAN_PAYMENTS:        PALETTE[3],
  GENERAL_SERVICES:     PALETTE[5],
  PERSONAL_CARE:        PALETTE[1],
  MEDICAL:              PALETTE[2],
  TRAVEL:               PALETTE[3],
  TRANSFER_IN:          PALETTE[5],
  TRANSFER_OUT:         PALETTE[4],
  INCOME:               PALETTE[5],
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

export const ALL_KNOWN_CATEGORIES = Object.keys(CATEGORY_LABELS)

export function getAllKnownCategories(customCategories: string[] = []): string[] {
  return [...new Set([...ALL_KNOWN_CATEGORIES, ...customCategories])]
}
