//! Append-only audit trail. Mirrors `src/main/repositories/audit.ts`.

use rusqlite::{params, Connection};
use serde_json::Value;

use crate::error::AppResult;

/// Passwords and hashes must never be included in `before`/`after`.
pub fn record(
    conn: &Connection,
    company_id: i64,
    entity: &str,
    entity_id: i64,
    action: &str,
    before: Option<&Value>,
    after: Option<&Value>,
    actor_user_id: Option<i64>,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO audit_events (company_id, entity, entity_id, action, before_json, after_json, actor_user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            company_id,
            entity,
            entity_id,
            action,
            before.map(|v| v.to_string()),
            after.map(|v| v.to_string()),
            actor_user_id
        ],
    )?;
    Ok(())
}
