import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations } from './identity'

/**
 * Idempotency / Transaction Id for sensitive money operations.
 * Stripe pattern: client generates UUIDv7 (time-sortable), server stores
 * (organization_id, key) UNIQUE and returns first response on duplicate.
 * Keeps sale atomic across retries and Electron crash mid-tx.
 */
export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    key: text('key').notNull(),
    response: text('response'), // JSON stringified IpcResult
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.key),
    index('idx_idempotency_org_key').on(table.organization_id, table.key)
  ]
)
