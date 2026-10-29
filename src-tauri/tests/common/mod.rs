//! Shared harness for the integration tests.
//!
//! Each test gets a real SQLite file in a throwaway directory and drives the
//! same dispatcher the Tauri `rpc` command calls. `Ctx::app` is `None` because
//! there is no window, which is exactly why the dialog commands report a clear
//! error instead of panicking.
#![allow(dead_code)]

use std::path::PathBuf;

use crown_books_lib as cb;
use serde_json::{json, Value};

pub struct Harness {
    pub inner: cb::state::Inner,
    pub paths: cb::paths::Paths,
    pub root: PathBuf,
}

impl Harness {
    pub fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("crown-books-it-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("create temp dir");

        let paths = cb::paths::Paths {
            user_data: root.clone(),
            database: root.join("crown-books.db"),
            backups: root.join("backups"),
        };
        paths.ensure().expect("create data dirs");

        let conn = cb::db::open(&paths.database).expect("open database");
        cb::db::migrate(&conn).expect("migrate");
        cb::db::seed::seed_permissions(&conn).expect("seed permissions");

        Self { inner: cb::state::Inner { conn, session: None }, paths, root }
    }

    /// Calls a channel and returns its data, panicking with the error code.
    pub fn call(&mut self, channel: &str, payload: Value) -> Value {
        let args: Vec<Value> = if payload.is_null() { Vec::new() } else { vec![payload] };
        let mut ctx = cb::state::Ctx::new(&mut self.inner, &self.paths, None);
        match cb::rpc::dispatch(&mut ctx, channel, &args) {
            Ok(data) => data,
            Err(err) => panic!("{channel} failed: {err}"),
        }
    }

    /// Calls a channel that must fail and returns its error code.
    pub fn err(&mut self, channel: &str, payload: Value) -> String {
        let args: Vec<Value> = if payload.is_null() { Vec::new() } else { vec![payload] };
        let mut ctx = cb::state::Ctx::new(&mut self.inner, &self.paths, None);
        match cb::rpc::dispatch(&mut ctx, channel, &args) {
            Ok(data) => panic!("{channel} was expected to fail, returned {data}"),
            Err(err) => err.code.to_string(),
        }
    }

    /// Sets up a company and returns the session plus the id of the owner role.
    pub fn setup_company(&mut self, name: &str, state_code: &str) -> Value {
        self.call(
            "identity:setup",
            json!({
                "name": name,
                "ownerFullName": "Asha Rao",
                "ownerEmail": "asha@acme.test",
                "ownerPassword": "correct-horse",
                "stateCode": state_code,
                "gstin": "27AAPFU0939F1ZV",
                "booksBeginDate": "2026-04-01"
            }),
        )
    }
}

impl Drop for Harness {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

pub fn rows(value: &Value) -> &Vec<Value> {
    value
        .as_array()
        .unwrap_or_else(|| panic!("expected an array, got {value}"))
}

pub fn id(value: &Value) -> i64 {
    value["id"].as_i64().unwrap_or_else(|| panic!("expected an id, got {value}"))
}

/// The account id for a seeded chart-of-accounts key, from `accounts:list`.
pub fn account_id(accounts: &Value, system_key: &str) -> i64 {
    rows(accounts)
        .iter()
        .find(|row| row["systemKey"] == json!(system_key))
        .and_then(|row| row["id"].as_i64())
        .unwrap_or_else(|| panic!("missing account {system_key}"))
}

/// The id of a named account group, from `accounts:groups`.
pub fn group_id(groups: &Value, name: &str) -> i64 {
    rows(groups)
        .iter()
        .find(|row| row["name"] == json!(name))
        .and_then(|row| row["id"].as_i64())
        .unwrap_or_else(|| panic!("missing account group {name}"))
}

/// The id of a seeded unit by symbol, from `units:list`.
pub fn unit_id(units: &Value, symbol: &str) -> i64 {
    rows(units)
        .iter()
        .find(|row| row["symbol"] == json!(symbol))
        .and_then(|row| row["id"].as_i64())
        .unwrap_or_else(|| panic!("missing unit {symbol}"))
}
