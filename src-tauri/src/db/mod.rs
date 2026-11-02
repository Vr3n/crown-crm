//! Database foundation: connection, pragmas, migrations, seed data.

pub mod permissions;
pub mod seed;

use std::path::Path;

use rusqlite::Connection;

use crate::error::{AppError, AppResult};

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (0, "accounting_core", include_str!("../../migrations/0000_accounting_core.sql")),
    (1, "voucher_numbering", include_str!("../../migrations/0001_voucher_numbering.sql")),
    (2, "numbering_reset_period", include_str!("../../migrations/0002_numbering_reset_period.sql")),
    (3, "unit_active", include_str!("../../migrations/0003_unit_active.sql")),
    (4, "item_price_tax", include_str!("../../migrations/0004_item_price_tax.sql")),
    (5, "supplier_bill_numbers", include_str!("../../migrations/0005_supplier_bill_numbers.sql")),
];

/// Opens the database with the same pragmas Electron used.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(conn)
}

/// Applies pending migrations in version order, recording each in
/// `schema_migrations` only after it succeeds. The whole run is atomic, so a
/// failing migration never leaves a half-migrated schema behind.
pub fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("BEGIN IMMEDIATE")?;
    let result = migrate_inner(conn);
    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(err) => {
            let _ = conn.execute_batch("ROLLBACK");
            Err(err)
        }
    }
}

fn migrate_inner(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY,
           name TEXT NOT NULL,
           applied_at TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    )?;

    let mut applied = std::collections::HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT version FROM schema_migrations")?;
        let rows = stmt.query_map([], |row| row.get::<_, i64>(0))?;
        for row in rows {
            applied.insert(row?);
        }
    }

    for (version, name, sql) in MIGRATIONS {
        if applied.contains(version) {
            continue;
        }
        apply_sql(conn, sql)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?1, ?2)",
            rusqlite::params![version, name],
        )?;
    }
    Ok(())
}

/// drizzle-kit separates statements with `--> statement-breakpoint`; hand
/// written files may simply contain several statements.
fn apply_sql(conn: &Connection, sql: &str) -> AppResult<()> {
    let mut chunk = String::new();
    for line in sql.lines() {
        if line.trim() == "--> statement-breakpoint" {
            flush(conn, &mut chunk)?;
        } else {
            chunk.push_str(line);
            chunk.push('\n');
        }
    }
    flush(conn, &mut chunk)
}

fn flush(conn: &Connection, chunk: &mut String) -> AppResult<()> {
    let statement = chunk.trim();
    if !statement.is_empty() {
        conn.execute_batch(statement)
            .map_err(|err| AppError::internal(format!("Migration failed: {err}")))?;
    }
    chunk.clear();
    Ok(())
}
