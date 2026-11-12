//! Structured, file-backed logging for the desktop shell.
//!
//! One JSON object per line. The renderer sends its records through the
//! `log_event` command, so renderer and backend lines share a trace id and land
//! in the same daily file. `scripts/logs.mjs` reads these files.
//!
//! The file lives under the app's user data directory, next to the database:
//! `%APPDATA%\Crown Books\logs\app-YYYY-MM-DD.jsonl` on Windows.
//!
//! Debug builds also write each line to stderr, so `tauri dev` shows the stream
//! without opening a file.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use chrono::{Local, SecondsFormat, Utc};
use serde_json::{json, Value};

struct Logger {
    dir: PathBuf,
    file: Option<File>,
    date: String,
}

static LOGGER: OnceLock<Mutex<Logger>> = OnceLock::new();
static TRACE_COUNTER: AtomicU64 = AtomicU64::new(0);

const RETENTION_DAYS: usize = 14;

pub fn init(dir: &Path) {
    if fs::create_dir_all(dir).is_err() {
        // Without a directory, `write` still reaches stderr in debug builds.
        return;
    }
    let _ = LOGGER.set(Mutex::new(Logger { dir: dir.to_path_buf(), file: None, date: String::new() }));
    prune(dir);
    info(
        "app",
        "logging.ready",
        None,
        json!({ "dir": dir.display().to_string(), "retentionDays": RETENTION_DAYS }),
    );
}

pub fn new_trace_id() -> String {
    let count = TRACE_COUNTER.fetch_add(1, Ordering::Relaxed);
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("{millis:x}-{count:x}")
}

pub fn debug(module: &str, event: &str, trace_id: Option<&str>, fields: Value) {
    write("debug", module, event, trace_id, fields, None);
}

pub fn info(module: &str, event: &str, trace_id: Option<&str>, fields: Value) {
    write("info", module, event, trace_id, fields, None);
}

pub fn warn(module: &str, event: &str, trace_id: Option<&str>, fields: Value) {
    write("warn", module, event, trace_id, fields, None);
}

pub fn error(
    module: &str,
    event: &str,
    trace_id: Option<&str>,
    fields: Value,
    code: &str,
    message: &str,
) {
    write(
        "error",
        module,
        event,
        trace_id,
        fields,
        Some(json!({ "code": code, "message": message })),
    );
}

/// A record sent by the renderer. The renderer owns its timestamp; the backend
/// keeps the source so the CLI can separate the two sides of one trace.
pub fn write_renderer(record: Value) {
    let level = record.get("level").and_then(Value::as_str).unwrap_or("info");
    let module = record.get("module").and_then(Value::as_str).unwrap_or("renderer");
    let event = record.get("event").and_then(Value::as_str).unwrap_or("log");
    let trace_id = record.get("traceId").and_then(Value::as_str);
    let fields = record.get("fields").cloned().unwrap_or_else(|| json!({}));
    let error = record.get("error").cloned();
    let ts = record
        .get("ts")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(now_iso);
    write_record(&ts, level, "renderer", module, event, trace_id, fields, error);
}

fn write(
    level: &str,
    module: &str,
    event: &str,
    trace_id: Option<&str>,
    fields: Value,
    error: Option<Value>,
) {
    write_record(&now_iso(), level, "backend", module, event, trace_id, fields, error);
}

fn write_record(
    ts: &str,
    level: &str,
    source: &str,
    module: &str,
    event: &str,
    trace_id: Option<&str>,
    fields: Value,
    error: Option<Value>,
) {
    let record = json!({
        "ts": ts,
        "level": level,
        "source": source,
        "module": module,
        "event": event,
        "traceId": trace_id,
        "fields": fields,
        "error": error,
    });
    let line = serde_json::to_string(&record).unwrap_or_else(|_| {
        "{\"level\":\"error\",\"source\":\"logging\",\"module\":\"logging\",\"event\":\"serialize.failed\"}"
            .to_string()
    });

    let Some(lock) = LOGGER.get() else { return };
    if cfg!(debug_assertions) || std::env::var("CROWN_BOOKS_LOG_STDERR").is_ok() {
        eprintln!("{line}");
    }
    if let Ok(mut logger) = lock.lock() {
        logger.write_line(&line);
    }
}

impl Logger {
    fn write_line(&mut self, line: &str) {
        let date = Local::now().format("%Y-%m-%d").to_string();
        if self.file.is_none() || self.date != date {
            let path = self.dir.join(format!("app-{date}.jsonl"));
            match OpenOptions::new().create(true).append(true).open(&path) {
                Ok(file) => {
                    self.file = Some(file);
                    self.date = date;
                }
                Err(_) => return,
            }
        }
        if let Some(file) = self.file.as_mut() {
            let _ = writeln!(file, "{line}");
            let _ = file.flush();
        }
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Keep the newest `RETENTION_DAYS` daily files. The names sort by date.
fn prune(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let name = path.file_name()?.to_str()?;
            if name.starts_with("app-") && name.ends_with(".jsonl") {
                Some(path)
            } else {
                None
            }
        })
        .collect();
    files.sort();
    while files.len() > RETENTION_DAYS {
        let old = files.remove(0);
        let _ = fs::remove_file(old);
    }
}
