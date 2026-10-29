//! Backup: create, list, destinations and reveal.
//!
//! Mirrors `src/main/ipc/backup.ts`. A backup is a byte-for-byte copy of the
//! live SQLite file, written after a WAL checkpoint so the `.db` is complete on
//! its own. Restore stays manual: replacing a live database needs the app
//! closed, so it is deliberately not automated.

mod destinations;

use std::path::Path;

use chrono::{DateTime, SecondsFormat, Utc};
use serde_json::{json, Value};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::db::permissions::codes as perm;
use crate::error::{AppError, AppResult};
use crate::json::req_str;
use crate::state::Ctx;

const MAX_PATH_LENGTH: usize = 500;

/// `2026-10-25T11-32-04-121Z` — the same shape Electron produced with
/// `new Date().toISOString().replace(/[:.]/g, '-')`, so file names stay
/// sortable and comparable with older backups.
fn backup_stamp() -> String {
    Utc::now().format("%Y-%m-%dT%H-%M-%S-%3fZ").to_string()
}

fn iso_timestamp(time: std::time::SystemTime) -> String {
    DateTime::<Utc>::from(time).to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn iso_now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn ensure_backup_dir(ctx: &Ctx<'_>) -> AppResult<()> {
    std::fs::create_dir_all(&ctx.paths.backups)
        .map_err(|err| AppError::internal(format!("Could not open the backup folder: {err}")))
}

fn path_input(input: &Value) -> AppResult<String> {
    let path = req_str(input, "path")?;
    if path.trim().is_empty() {
        return Err(AppError::validation("path is required"));
    }
    if path.chars().count() > MAX_PATH_LENGTH {
        return Err(AppError::validation(format!(
            "path must be {MAX_PATH_LENGTH} characters or fewer"
        )));
    }
    Ok(path)
}

/// Copies the live SQLite file into the primary folder and every configured
/// destination. The primary copy must succeed; extra folders are independent,
/// so an unplugged drive is reported and the other copies still happen.
fn create(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;
    ensure_backup_dir(ctx)?;

    // The `.db` must be complete on its own: a backup with a `-wal` sidecar is
    // not a backup. `execute_batch` runs outside a transaction, which SQLite
    // requires for a checkpoint.
    ctx.db()
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(|err| AppError::internal(format!("Could not checkpoint the database: {err}")))?;

    let name = format!("crown-books-{}.db", backup_stamp());
    let target = ctx.paths.backups.join(&name);
    std::fs::copy(&ctx.paths.database, &target)
        .map_err(|err| AppError::internal(format!("Could not create the backup: {err}")))?;

    let metadata = std::fs::metadata(&target)
        .map_err(|err| AppError::internal(format!("Could not read the backup: {err}")))?;
    let size_bytes = metadata.len();
    let created_at = metadata
        .modified()
        .map(iso_timestamp)
        .unwrap_or_else(|_| iso_now());

    let extras = destinations::read_destinations(&ctx.paths.user_data);
    let mut copies = vec![json!({ "path": ctx.paths.backups.to_string_lossy(), "ok": true })];
    copies.extend(destinations::copy_to_folders(
        &ctx.paths.database,
        &extras,
        &name,
    ));

    Ok(json!({
        "name": name,
        "sizeBytes": size_bytes,
        "createdAt": created_at,
        "copies": copies
    }))
}

/// The primary folder only. Scanning every configured drive on each page load
/// would be slow and would fail on an unplugged disk; the destination list
/// already says whether each extra folder is reachable.
fn list(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;
    ensure_backup_dir(ctx)?;

    let entries = std::fs::read_dir(&ctx.paths.backups)
        .map_err(|err| AppError::internal(format!("Could not read the backup folder: {err}")))?;

    let mut files: Vec<Value> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("db") {
            continue;
        }
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let created_at = metadata
            .modified()
            .map(iso_timestamp)
            .unwrap_or_else(|_| iso_now());
        files.push(json!({
            "name": name,
            "sizeBytes": metadata.len(),
            "createdAt": created_at
        }));
    }

    // Newest first, matching the ISO strings the renderer sorts and displays.
    files.sort_by(|left, right| {
        let key = |value: &Value| {
            value
                .get("createdAt")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string()
        };
        key(right).cmp(&key(left))
    });

    Ok(Value::Array(files))
}

fn destinations(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;
    ensure_backup_dir(ctx)?;
    Ok(destinations::list_destinations(
        &ctx.paths.user_data,
        &ctx.paths.backups,
    ))
}

/// The native folder picker means the user cannot type a path that does not
/// exist. A cancelled dialog resolves to `null`, not an error.
fn add_destination(ctx: &mut Ctx<'_>) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;

    let picked = ctx
        .app_handle()?
        .dialog()
        .file()
        .set_title("Choose a backup folder")
        .blocking_pick_folder();
    let Some(picked) = picked else {
        return Ok(Value::Null);
    };
    let folder = picked
        .into_path()
        .map_err(|err| AppError::internal(format!("Could not use that folder: {err}")))?;

    ensure_backup_dir(ctx)?;
    destinations::add_destination(
        &ctx.paths.user_data,
        &folder.to_string_lossy(),
        &ctx.paths.backups,
    )
}

fn remove_destination(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;
    let path = path_input(input)?;
    ensure_backup_dir(ctx)?;
    destinations::remove_destination(&ctx.paths.user_data, &path, &ctx.paths.backups)
}

/// Opens a backup folder in the file manager. The folder list already shows
/// whether a destination is available, so only a missing path is an error —
/// a file manager that refuses to open is not.
fn reveal(ctx: &mut Ctx<'_>, input: &Value) -> AppResult<Value> {
    ctx.require_permission(perm::BACKUP_MANAGE)?;
    let path = path_input(input)?;

    if !Path::new(&path).exists() {
        return Err(AppError::internal(
            "That folder is not available right now.",
        ));
    }

    let _ = ctx.app_handle()?.opener().open_path(path, None::<&str>);
    Ok(Value::Null)
}

pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "backup:create" => Some(create(ctx)),
        "backup:list" => Some(list(ctx)),
        "backup:destinations" => Some(destinations(ctx)),
        "backup:addDestination" => Some(add_destination(ctx)),
        "backup:removeDestination" => Some(remove_destination(ctx, crate::json::arg(args, 0))),
        "backup:reveal" => Some(reveal(ctx, crate::json::arg(args, 0))),
        _ => None,
    }
}
