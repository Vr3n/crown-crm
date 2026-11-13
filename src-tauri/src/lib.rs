//! Crown Books desktop shell.
//!
//! Electron's main process is replaced by this crate: the React renderer talks
//! to one Tauri command, `rpc`, which dispatches on the same channel strings the
//! preload bridge already used. SQLite runs in-process through `rusqlite`.

pub mod access;
pub mod audit;
pub mod auth;
pub mod backup;
pub mod dashboard;
pub mod db;
pub mod error;
pub mod export;
pub mod identity;
pub mod json;
pub mod license;
pub mod logging;
pub mod masters;
pub mod numbering;
pub mod paths;
pub mod reports;
pub mod rpc;
pub mod search;
pub mod state;
pub mod summaries;
pub mod vouchers;

use serde_json::{json, Value};

/// The single entry point for every renderer call.
///
/// Returns the `IpcResult` envelope the preload bridge unwraps: failures are
/// data, not rejected promises, so the renderer keeps branching on
/// `error.code` exactly as it did under Electron.
#[tauri::command(async, rename_all = "camelCase")]
fn rpc(
    app: tauri::AppHandle,
    state: tauri::State<'_, state::AppState>,
    channel: String,
    args: Vec<Value>,
    trace_id: Option<String>,
) -> Value {
    let trace_id = trace_id.unwrap_or_else(logging::new_trace_id);
    let started = std::time::Instant::now();
    logging::info(
        "rpc",
        "rpc.start",
        Some(&trace_id),
        json!({ "channel": channel, "argc": args.len() }),
    );

    let mut inner = match state.inner.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let mut ctx = state::Ctx::new(&mut inner, &state.paths, Some(&app));
    ctx.set_trace_id(trace_id.clone());

    // A handler must never leave the shared connection inside a transaction. If
    // one panics, the unwind skips the `ROLLBACK` inside `Ctx::with_tx`, and
    // every later command would fail with "cannot start a transaction within a
    // transaction". Catch it, report INTERNAL_ERROR and unwind the transaction.
    let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        rpc::dispatch(&mut ctx, &channel, &args)
    }));
    let result = match outcome {
        Ok(result) => result,
        Err(panic) => {
            let detail = panic_message(&panic);
            logging::error(
                "rpc",
                "rpc.panic",
                Some(&trace_id),
                json!({ "channel": channel, "detail": detail }),
                error::codes::INTERNAL_ERROR,
                &detail,
            );
            Err(error::AppError::internal(format!("Command failed: {detail}")))
        }
    };

    if !ctx.db().is_autocommit() {
        let _ = ctx.db().execute_batch("ROLLBACK");
    }

    let duration_ms = started.elapsed().as_millis() as u64;
    match result {
        Ok(data) => {
            logging::info(
                "rpc",
                "rpc.ok",
                Some(&trace_id),
                json!({ "channel": channel, "durationMs": duration_ms }),
            );
            error::ok(data)
        }
        Err(err) => {
            logging::error(
                "rpc",
                "rpc.fail",
                Some(&trace_id),
                json!({ "channel": channel, "durationMs": duration_ms }),
                err.code,
                &err.message,
            );
            err.envelope()
        }
    }
}

/// Renderer log records. Kept outside `rpc` so logging never waits on the
/// database lock.
#[tauri::command]
fn log_event(records: Vec<Value>) {
    for record in records {
        logging::write_renderer(record);
    }
}

/// Best-effort text from a panic payload, for the log line.
fn panic_message(panic: &Box<dyn std::any::Any + Send>) -> String {
    if let Some(text) = panic.downcast_ref::<&str>() {
        return (*text).to_string();
    }
    if let Some(text) = panic.downcast_ref::<String>() {
        return text.clone();
    }
    "unknown panic".to_string()
}

pub fn run() {
    // Bind this install to the machine before anything else, exactly like
    // Electron's `ensureInstallLock()`.
    license::ensure_install_lock();

    let paths = paths::Paths::resolve();
    if let Err(err) = paths.ensure() {
        panic!("Cannot create the data directory {}: {err}", paths.user_data.display());
    }
    logging::init(&paths.logs);
    logging::info(
        "app",
        "startup.begin",
        None,
        json!({
            "version": env!("CARGO_PKG_VERSION"),
            "profile": paths::profile(),
            "userData": paths.user_data.display().to_string(),
            "logs": paths.logs.display().to_string(),
        }),
    );

    let conn = match db::open(&paths.database) {
        Ok(conn) => conn,
        Err(err) => {
            logging::error(
                "db",
                "open.fail",
                None,
                json!({ "database": paths.database.display().to_string() }),
                error::codes::INTERNAL_ERROR,
                &err.to_string(),
            );
            panic!("Cannot open {}: {err}", paths.database.display());
        }
    };
    logging::info("db", "open.ok", None, json!({ "database": paths.database.display().to_string() }));
    if let Err(err) = db::migrate(&conn) {
        logging::error(
            "db",
            "migrate.fail",
            None,
            json!({}),
            error::codes::INTERNAL_ERROR,
            &err.to_string(),
        );
        panic!("Database migration failed: {err}");
    }
    logging::info("db", "migrate.ok", None, json!({}));
    if let Err(err) = db::seed::seed_permissions(&conn) {
        logging::error(
            "db",
            "seed.fail",
            None,
            json!({}),
            error::codes::INTERNAL_ERROR,
            &err.to_string(),
        );
        panic!("Seeding the permission catalog failed: {err}");
    }

    // Restore the remembered login before the window loads, so the renderer's
    // first status call does not flash the login screen.
    let session = match identity::app::restore_remembered_login(&conn) {
        Ok(session) => session,
        Err(err) => {
            logging::warn(
                "auth",
                "session.restore.fail",
                None,
                json!({ "message": err.to_string() }),
            );
            None
        }
    };
    logging::info(
        "app",
        "startup.ready",
        None,
        json!({ "signedIn": session.is_some() }),
    );

    let app_state = state::AppState::new(conn, session, paths);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![rpc, log_event])
        .run(tauri::generate_context!())
        .expect("error while running Crown Books");
}
