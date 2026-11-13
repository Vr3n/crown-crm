//! Application state and the per-command context.
//!
//! One SQLite connection and one in-memory session are shared by every command.
//! Tauri runs commands off the main thread, so a single `Mutex` is enough: it
//! serialises writes, which is what a single desktop user wants anyway.

use std::sync::Mutex;

use rusqlite::Connection;
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::paths::Paths;

#[derive(Debug, Clone)]
pub struct Session {
    pub company_id: i64,
    pub company_slug: String,
    pub company_name: String,
    pub user_id: i64,
    pub user_full_name: String,
    pub user_email: String,
    pub role_id: i64,
    pub role_name: String,
    pub is_super: bool,
    pub permissions: Vec<String>,
}

impl Session {
    pub fn to_json(&self) -> Value {
        json!({
            "companyId": self.company_id,
            "companySlug": self.company_slug,
            "companyName": self.company_name,
            "userId": self.user_id,
            "userFullName": self.user_full_name,
            "userEmail": self.user_email,
            "roleId": self.role_id,
            "roleName": self.role_name,
            "isSuper": self.is_super,
            "permissions": self.permissions
        })
    }
}

pub struct Inner {
    pub conn: Connection,
    pub session: Option<Session>,
}

pub struct AppState {
    pub inner: Mutex<Inner>,
    pub paths: Paths,
}

impl AppState {
    pub fn new(conn: Connection, session: Option<Session>, paths: Paths) -> Self {
        Self { inner: Mutex::new(Inner { conn, session }), paths }
    }
}

/// Everything a command handler needs. Held for the duration of one RPC call.
pub struct Ctx<'a> {
    pub inner: &'a mut Inner,
    pub paths: &'a Paths,
    /// Window handle used by the two commands that need a native dialog
    /// (`export:*` save dialogs) or a shell reveal (`backup:reveal`).
    ///
    /// `None` in tests: everything except those commands is window-independent.
    pub app: Option<&'a tauri::AppHandle>,
    trace_id: Option<String>,
    tx_depth: u32,
    savepoint_seq: u32,
}

impl<'a> Ctx<'a> {
    pub fn new(inner: &'a mut Inner, paths: &'a Paths, app: Option<&'a tauri::AppHandle>) -> Self {
        Self { inner, paths, app, trace_id: None, tx_depth: 0, savepoint_seq: 0 }
    }

    /// The id shared by the renderer call and the backend work it caused.
    pub fn set_trace_id(&mut self, trace_id: String) {
        self.trace_id = Some(trace_id);
    }

    pub fn trace_id(&self) -> Option<&str> {
        self.trace_id.as_deref()
    }

    /// The window handle, or a clear error when running headless.
    pub fn app_handle(&self) -> AppResult<&tauri::AppHandle> {
        self.app
            .ok_or_else(|| AppError::internal("No application window is available"))
    }

    pub fn db(&self) -> &Connection {
        &self.inner.conn
    }

    pub fn session(&self) -> Option<&Session> {
        self.inner.session.as_ref()
    }

    pub fn set_session(&mut self, session: Option<Session>) {
        self.inner.session = session;
    }

    pub fn require_session(&self) -> AppResult<&Session> {
        self.inner
            .session
            .as_ref()
            .ok_or_else(|| AppError::unauthenticated("Authentication required"))
    }

    pub fn company_id(&self) -> AppResult<i64> {
        Ok(self.require_session()?.company_id)
    }

    pub fn user_id(&self) -> AppResult<i64> {
        Ok(self.require_session()?.user_id)
    }

    /// The enforcement point. Super roles short-circuit; code checks
    /// permissions, never role names.
    pub fn require_permission(&self, code: &str) -> AppResult<()> {
        let session = self.require_session()?;
        if session.is_super || session.permissions.iter().any(|p| p == code) {
            return Ok(());
        }
        Err(AppError::permission_denied(code))
    }

    pub fn has_permission(&self, code: &str) -> bool {
        match self.session() {
            Some(session) => session.is_super || session.permissions.iter().any(|p| p == code),
            None => false,
        }
    }

    /// Runs `f` inside a write transaction. Nested calls become SAVEPOINTs, so a
    /// repository can wrap its own work even when a use case already owns the
    /// boundary. Mirrors `withTransaction` in `src/main/db/connection.ts`.
    pub fn with_tx<T>(&mut self, f: impl FnOnce(&mut Ctx<'_>) -> AppResult<T>) -> AppResult<T> {
        let outer = self.tx_depth == 0;
        if outer {
            self.inner.conn.execute_batch("BEGIN IMMEDIATE")?;
        } else {
            self.savepoint_seq += 1;
            let marker = format!("sp_{}", self.savepoint_seq);
            self.inner.conn.execute_batch(&format!("SAVEPOINT {marker}"))?;
        }
        self.tx_depth += 1;

        let outcome = f(self);

        self.tx_depth -= 1;
        if outer {
            match &outcome {
                Ok(_) => self.inner.conn.execute_batch("COMMIT")?,
                Err(_) => {
                    let _ = self.inner.conn.execute_batch("ROLLBACK");
                }
            }
        } else {
            let marker = format!("sp_{}", self.savepoint_seq);
            match &outcome {
                Ok(_) => self.inner.conn.execute_batch(&format!("RELEASE SAVEPOINT {marker}"))?,
                Err(_) => {
                    let _ = self
                        .inner
                        .conn
                        .execute_batch(&format!("ROLLBACK TO SAVEPOINT {marker}; RELEASE SAVEPOINT {marker}"));
                }
            }
        }
        outcome
    }
}

/// `YYYY-MM-DD` for today in local time, matching the renderer's date inputs.
pub fn today_iso() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// `YYYY-MM-DD HH:MM:SS` in UTC, the format SQLite's `datetime('now')` writes.
pub fn now_sqlite() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
