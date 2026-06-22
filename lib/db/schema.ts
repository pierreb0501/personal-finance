import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  plaidItemId: text('plaid_item_id').notNull(),
  accessToken: text('access_token').notNull(),
  cursor: text('cursor'),
  institutionName: text('institution_name').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull().default('ok'), // 'ok' | 'login_required' | 'error'
})

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id),
  plaidAccountId: text('plaid_account_id').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  subtype: text('subtype').notNull(),
  balanceCurrent: real('balance_current').notNull(),
  balanceAvailable: real('balance_available'),
  isoCurrencyCode: text('iso_currency_code').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('accounts_item_id_idx').on(table.itemId),
])

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  date: text('date').notNull(),
  merchantName: text('merchant_name'),
  rawName: text('raw_name'),
  category: text('category').notNull(),
  categoryDetailed: text('category_detailed').notNull(),
  pending: integer('pending').notNull(),
  customCategory: text('custom_category'),
  ignored: integer('ignored').notNull().default(0),
}, (table) => [
  index('transactions_date_idx').on(table.date),
  index('transactions_account_id_idx').on(table.accountId),
  index('transactions_merchant_name_idx').on(table.merchantName),
])

export const holdings = sqliteTable('holdings', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  securityName: text('security_name').notNull(),
  tickerSymbol: text('ticker_symbol'),
  quantity: real('quantity').notNull(),
  institutionValue: real('institution_value').notNull(),
  costBasis: real('cost_basis'),
  updatedAt: integer('updated_at').notNull(),
})

export const snapshots = sqliteTable('snapshots', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  totalAssets: real('total_assets').notNull(),
  totalLiabilities: real('total_liabilities').notNull(),
  netWorth: real('net_worth').notNull(),
  investmentsValue: real('investments_value').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const categoryRules = sqliteTable('category_rules', {
  id: text('id').primaryKey(),
  merchantName: text('merchant_name').notNull().unique(),
  category: text('category').notNull(),
  createdAt: integer('created_at').notNull(),
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const categoryBudgets = sqliteTable('category_budgets', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  planned: real('planned').notNull(),
})

export const customCategories = sqliteTable('custom_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: integer('created_at').notNull(),
})

export const manualRecurring = sqliteTable('manual_recurring', {
  id: text('id').primaryKey(),
  merchantName: text('merchant_name').notNull().unique(),
  dayOfMonth: integer('day_of_month').notNull(),
  avgAmount: real('avg_amount').notNull(),
  category: text('category').notNull(),
  groupName: text('group_name'),
  createdAt: integer('created_at').notNull(),
})

export const dismissedRecurring = sqliteTable('dismissed_recurring', {
  merchantName: text('merchant_name').primaryKey(),
})

export const committedItems = sqliteTable('committed_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),          // 'income' | 'expense'
  expectedAmount: real('expected_amount').notNull(),
  expectedDay: integer('expected_day'),  // nullable
  merchantName: text('merchant_name'),   // nullable, used for matching
  category: text('category').notNull(),
  groupName: text('group_name'),
  createdAt: integer('created_at').notNull(),
})

export const recurringMerchantGroups = sqliteTable('recurring_merchant_groups', {
  merchantName: text('merchant_name').primaryKey(),
  groupName: text('group_name').notNull(),
})

// Tracks failed login attempts per source IP for rate limiting. DB-backed
// (rather than in-memory) so the limit holds even across serverless cold
// starts / multiple instances.
export const loginAttempts = sqliteTable('login_attempts', {
  ip: text('ip').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: integer('window_start').notNull(),
})
