import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  plaidItemId: text('plaid_item_id').notNull(),
  accessToken: text('access_token').notNull(),
  cursor: text('cursor'),
  institutionName: text('institution_name').notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull().default('ok'), // 'ok' | 'login_required' | 'error'
  // The exact Plaid error_code (e.g. ITEM_LOGIN_REQUIRED, PENDING_EXPIRATION,
  // INSTITUTION_DOWN) behind a non-ok status. Null when status is 'ok'. Lets the
  // UI show *why* a connection dropped instead of forcing a Plaid dashboard dig.
  errorCode: text('error_code'),
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
  // Accrual amortization: NULL/1 books in the posting month (default); N>1 spreads
  // the amount over N months starting the posting month. Analytics-only — the raw
  // posting is never altered. See lib/amortize.ts.
  spreadMonths: integer('spread_months'),
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
  // When 1, the displayed amount is the trailing 12-month average of the
  // merchant's transactions (mirrors committed_items.auto_average); avg_amount
  // is then the fallback used until there's history. When 0, avg_amount is a
  // fixed user-set value.
  autoAverage: integer('auto_average').notNull().default(0),
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
  // Cadence: how often this item recurs. Default 1 = every month (existing behaviour).
  // Values > 1 require anchorYear + anchorMonth to establish the reference month
  // from which due months are computed: due when (Y*12+M - anchorY*12-anchorM) % intervalMonths === 0
  intervalMonths: integer('interval_months').notNull().default(1),
  anchorYear: integer('anchor_year'),    // nullable — only required when intervalMonths > 1
  anchorMonth: integer('anchor_month'),  // nullable — 1-indexed
  // When 1, the displayed expected amount is the trailing 12-month average of
  // matched transactions (for bills that drift, e.g. telecom). When 0, the fixed
  // expected_amount the user entered is used. expected_amount is retained either
  // way as the fallback when there's no history to average yet.
  autoAverage: integer('auto_average').notNull().default(0),
})

export const recurringMerchantGroups = sqliteTable('recurring_merchant_groups', {
  merchantName: text('merchant_name').primaryKey(),
  groupName: text('group_name').notNull(),
})

export const investmentTransactions = sqliteTable('investment_transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  securityName: text('security_name'),
  tickerSymbol: text('ticker_symbol'),
  type: text('type').notNull(),
  subtype: text('subtype'),
  amount: real('amount').notNull(),
  quantity: real('quantity'),
  price: real('price'),
  fees: real('fees'),
  date: text('date').notNull(),
  isoCurrencyCode: text('iso_currency_code').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('inv_tx_account_id_idx').on(table.accountId),
  index('inv_tx_date_idx').on(table.date),
])

// Tracks failed login attempts per source IP for rate limiting. DB-backed
// (rather than in-memory) so the limit holds even across serverless cold
// starts / multiple instances.
export const loginAttempts = sqliteTable('login_attempts', {
  ip: text('ip').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: integer('window_start').notNull(),
})

export const categoryLabels = sqliteTable('category_labels', {
  category: text('category').primaryKey(), // effective category name (customCategory ?? category)
  kind: text('kind').notNull(),            // 'fixed' | 'flexible' | 'savings'
})
