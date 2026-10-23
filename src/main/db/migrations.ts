import { DatabaseSync } from 'node:sqlite'
import { getDb, withTransaction } from './connection'
import accountingCoreSql from './migrations/20261021000000_accounting_core/migration.sql?raw'
import voucherNumberingSql from './migrations/20261023000000_voucher_numbering/migration.sql?raw'
import numberingResetPeriodSql from './migrations/20261023000001_numbering_reset_period/migration.sql?raw'
import unitActiveSql from './migrations/20261024000000_unit_active/migration.sql?raw'

/**
 * Migration runner.
 *
 * Crown Books starts on a new database file (`crown-books.db`) and a new
 * baseline: version 0 creates the accounting schema. The gym CRM database
 * (`CrownCRM.db`) is never opened by this application, so no legacy
 * reconciliation is needed.
 *
 * Rules for future migrations:
 *  - append only, never edit a shipped file
 *  - one concern per migration
 *  - bump the version by one and add the import here
 *  - exercise the migration in tests/main/db/migrations.test.ts
 */
interface Migration {
  version: number
  name: string
  sql: string
}

const migrations: Migration[] = [
  { version: 0, name: 'accounting_core', sql: accountingCoreSql },
  { version: 1, name: 'voucher_numbering', sql: voucherNumberingSql },
  { version: 2, name: 'numbering_reset_period', sql: numberingResetPeriodSql },
  { version: 3, name: 'unit_active', sql: unitActiveSql }
]

const BREAKPOINT_RE = /^\s*--> statement-breakpoint\s*$/m

/**
 * Executes a drizzle-kit generated SQL file. Generated files separate
 * statements with `--> statement-breakpoint`; hand written files may simply
 * contain several statements, which `exec` handles in one call.
 */
function applySql(db: DatabaseSync, sql: string): void {
  const statements = sql
    .split(BREAKPOINT_RE)
    .map((s) => s.trim())
    .filter(Boolean)
  for (const statement of statements) {
    db.exec(statement)
  }
}

/**
 * Applies pending migrations in version order, recording each in
 * `schema_migrations` only after it succeeds. The whole run is atomic: a
 * failing migration rolls everything back, so a partially migrated schema is
 * never left behind.
 */
export function runMigrations(): void {
  const db: DatabaseSync = getDb()

  withTransaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    const applied = new Set(
      (db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]).map(
        (r) => r.version
      )
    )

    const insert = db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue
      applySql(db, migration.sql)
      insert.run(migration.version, migration.name)
    }
  })
}
