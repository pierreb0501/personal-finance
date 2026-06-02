import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  plaidItemId: text('plaid_item_id').notNull(),
  accessToken: text('access_token').notNull(),
  cursor: text('cursor'),
  institutionName: text('institution_name').notNull(),
  createdAt: integer('created_at').notNull(),
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
})

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  date: text('date').notNull(),
  merchantName: text('merchant_name'),
  category: text('category').notNull(),
  categoryDetailed: text('category_detailed').notNull(),
  pending: integer('pending').notNull(),
  customCategory: text('custom_category'),
})

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
