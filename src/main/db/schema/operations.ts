import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { companies, users } from './identity'

/** Reference table for payment methods, seeded per company. */
export const paymentMethods = sqliteTable(
  'payment_methods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true)
  },
  (table) => [
    unique().on(table.company_id, table.name),
    index('idx_payment_methods_company').on(table.company_id)
  ]
)

/** Append only. Never updated, never deleted, never read by reports. */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    entity: text('entity').notNull(),
    entity_id: integer('entity_id').notNull(),
    /** CREATE | POST | CANCEL | UPDATE | DEACTIVATE | RESTORE */
    action: text('action').notNull(),
    before_json: text('before_json'),
    after_json: text('after_json'),
    actor_user_id: integer('actor_user_id').references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_audit_company_entity').on(table.company_id, table.entity, table.entity_id),
    index('idx_audit_company_date').on(table.company_id, table.created_at)
  ]
)
