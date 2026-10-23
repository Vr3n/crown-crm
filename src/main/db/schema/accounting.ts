import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { companies, users } from './identity'

/**
 * Masters: chart of accounts, parties, items and the reference data a voucher
 * needs. Every row is scoped to a company.
 */

export const accountGroups = sqliteTable(
  'account_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    /** Self reference kept as a plain integer to avoid a circular type. */
    parent_id: integer('parent_id'),
    /** ASSET | LIABILITY | EQUITY | INCOME | EXPENSE */
    nature: text('nature').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    is_system: integer('is_system', { mode: 'boolean' }).notNull().default(false)
  },
  (table) => [
    unique().on(table.company_id, table.name),
    index('idx_account_groups_company').on(table.company_id)
  ]
)

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    group_id: integer('group_id')
      .notNull()
      .references(() => accountGroups.id),
    name: text('name').notNull(),
    code: text('code'),
    /** ASSET | LIABILITY | EQUITY | INCOME | EXPENSE */
    type: text('type').notNull(),
    /**
     * Reserved keys the posting engine resolves by name-independent lookup, for
     * example SALES, OUTPUT_CGST, ROUND_OFF, COGS, INVENTORY, DEBTORS_CONTROL.
     */
    system_key: text('system_key'),
    is_system: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    opening_balance_minor: integer('opening_balance_minor').notNull().default(0),
    /** DEBIT | CREDIT */
    opening_balance_side: text('opening_balance_side').notNull().default('DEBIT'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.company_id, table.name),
    index('idx_accounts_company_type').on(table.company_id, table.type),
    index('idx_accounts_company_group').on(table.company_id, table.group_id)
  ]
)

/** A party is one real business. It may be a customer, a supplier, or both. */
export const parties = sqliteTable(
  'parties',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    display_name: text('display_name'),
    phone: text('phone'),
    email: text('email'),
    gstin: text('gstin'),
    pan: text('pan'),
    state_code: text('state_code'),
    billing_address: text('billing_address'),
    shipping_address: text('shipping_address'),
    is_customer: integer('is_customer', { mode: 'boolean' }).notNull().default(false),
    is_supplier: integer('is_supplier', { mode: 'boolean' }).notNull().default(false),
    credit_days: integer('credit_days').notNull().default(0),
    credit_limit_minor: integer('credit_limit_minor').notNull().default(0),
    opening_balance_minor: integer('opening_balance_minor').notNull().default(0),
    opening_balance_date: text('opening_balance_date'),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by').references(() => users.id)
  },
  (table) => [
    index('idx_parties_company_name').on(table.company_id, table.name),
    index('idx_parties_company_customer').on(table.company_id, table.is_customer, table.is_active),
    index('idx_parties_company_phone').on(table.company_id, table.phone)
  ]
)

/**
 * A party that is both customer and supplier needs one account on each side of
 * the balance sheet. This link is created with the party.
 */
export const partyAccounts = sqliteTable(
  'party_accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    party_id: integer('party_id')
      .notNull()
      .references(() => parties.id),
    account_id: integer('account_id')
      .notNull()
      .references(() => accounts.id),
    /** DEBTOR | CREDITOR */
    role: text('role').notNull()
  },
  (table) => [
    unique().on(table.company_id, table.party_id, table.role),
    index('idx_party_accounts_account').on(table.account_id)
  ]
)

export const units = sqliteTable(
  'units',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    decimals: integer('decimals').notNull().default(0),
    is_system: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [unique().on(table.company_id, table.name)]
)

export const stockGroups = sqliteTable(
  'stock_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    parent_id: integer('parent_id'),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [unique().on(table.company_id, table.name)]
)

export const godowns = sqliteTable(
  'godowns',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    address: text('address'),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [unique().on(table.company_id, table.name)]
)

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    sku: text('sku'),
    hsn_sac: text('hsn_sac'),
    uom_id: integer('uom_id').references(() => units.id),
    stock_group_id: integer('stock_group_id').references(() => stockGroups.id),
    gst_rate_bps: integer('gst_rate_bps').notNull().default(0),
    cess_rate_bps: integer('cess_rate_bps').notNull().default(0),
    is_service: integer('is_service', { mode: 'boolean' }).notNull().default(false),
    track_serial: integer('track_serial', { mode: 'boolean' }).notNull().default(false),
    sale_price_minor: integer('sale_price_minor').notNull().default(0),
    purchase_price_minor: integer('purchase_price_minor').notNull().default(0),
    opening_qty_e4: integer('opening_qty_e4').notNull().default(0),
    opening_rate_minor: integer('opening_rate_minor').notNull().default(0),
    reorder_level_e4: integer('reorder_level_e4').notNull().default(0),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    notes: text('notes'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by').references(() => users.id)
  },
  (table) => [
    index('idx_items_company_name').on(table.company_id, table.name),
    index('idx_items_company_hsn').on(table.company_id, table.hsn_sac),
    unique().on(table.company_id, table.sku)
  ]
)

/** GST rates are rows with effective dates. A change inserts, never edits. */
export const taxRates = sqliteTable(
  'tax_rates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    gst_rate_bps: integer('gst_rate_bps').notNull(),
    cess_rate_bps: integer('cess_rate_bps').notNull().default(0),
    description: text('description'),
    effective_from: text('effective_from').notNull(),
    effective_to: text('effective_to')
  },
  (table) => [index('idx_tax_rates_company').on(table.company_id, table.effective_from)]
)
