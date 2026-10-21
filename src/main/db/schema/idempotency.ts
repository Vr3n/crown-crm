import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { companies } from './identity'

/**
 * Idempotency for sensitive money operations.
 *
 * The renderer generates a request id. The main process stores the response
 * against (company, channel, key) and returns the first result on a repeat. A
 * repeat with a different payload is refused with IDEMPOTENCY_CONFLICT.
 */
export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    company_id: integer('company_id')
      .notNull()
      .references(() => companies.id),
    channel: text('channel').notNull(),
    key: text('key').notNull(),
    payload_hash: text('payload_hash'),
    response: text('response'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.company_id, table.channel, table.key),
    index('idx_idempotency_company_key').on(table.company_id, table.key)
  ]
)
