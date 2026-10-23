import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/**
 * Tenancy and access.
 *
 * A company is one set of books. Version 1 runs one active company per
 * installation, but every table in the product carries `company_id`, so adding
 * a company switcher later needs no migration.
 */
export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  legal_name: text('legal_name'),
  gstin: text('gstin'),
  pan: text('pan'),
  state_code: text('state_code').notNull(),
  address: text('address'),
  city: text('city'),
  pincode: text('pincode'),
  phone: text('phone'),
  email: text('email'),
  currency: text('currency').notNull().default('INR'),
  fy_start_month: integer('fy_start_month').notNull().default(4),
  books_begin_date: text('books_begin_date').notNull(),
  logo: text('logo'),
  invoice_prefix: text('invoice_prefix'),
  invoice_terms: text('invoice_terms').default(
    '1. This is a computer generated invoice and is valid without a signature.\n2. Goods once sold will not be taken back after 7 days.\n3. Report any discrepancy within 7 days of the invoice date.'
  ),
  costing_method: text('costing_method').notNull().default('WEIGHTED_AVERAGE'),
  round_off_mode: text('round_off_mode').notNull().default('INVOICE'),
  allow_negative_stock: integer('allow_negative_stock', { mode: 'boolean' })
    .notNull()
    .default(true),
  status: text('status').notNull().default('ACTIVE'),
  /** Set when the owner finishes the numbering step of first run. */
  numbering_setup_at: text('numbering_setup_at'),
  /** Set when the guided tour is finished or skipped. */
  onboarding_completed_at: text('onboarding_completed_at'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`)
})

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  full_name: text('full_name').notNull(),
  email: text('email').notNull(),
  password_hash: text('password_hash').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  created_at: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`)
})

export const roles = sqliteTable(
  'roles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    is_system_role: integer('is_system_role', { mode: 'boolean' }).notNull().default(false),
    is_super: integer('is_super', { mode: 'boolean' }).notNull().default(false),
    description: text('description')
  },
  (table) => [unique().on(table.company_id, table.name)]
)

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  description: text('description')
})

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission_id: integer('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' })
  },
  (table) => [primaryKey({ columns: [table.role_id, table.permission_id] })]
)

export const companyUsers = sqliteTable(
  'company_users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    user_id: integer('user_id')
      .notNull()
      .references(() => users.id),
    role_id: integer('role_id')
      .notNull()
      .references(() => roles.id),
    status: text('status').notNull().default('ACTIVE'),
    joined_at: text('joined_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.company_id, table.user_id),
    index('idx_company_users_company').on(table.company_id),
    index('idx_company_users_user').on(table.user_id)
  ]
)

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
