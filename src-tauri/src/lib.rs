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
pub mod masters;
pub mod numbering;
pub mod paths;
pub mod reports;
pub mod rpc;
pub mod search;
pub mod state;
pub mod summaries;
pub mod vouchers;

use serde_json::Value;

/// The single entry point for every renderer call.
///
/// Returns the `IpcResult` envelope the preload bridge unwraps: failures are
/// data, not rejected promises, so the renderer keeps branching on
/// `error.code` exactly as it did under Electron.
#[tauri::command(async)]
fn rpc(
    app: tauri::AppHandle,
    state: tauri::State<'_, state::AppState>,
    channel: String,
    args: Vec<Value>,
) -> Value {
    let mut inner = match state.inner.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let mut ctx = state::Ctx::new(&mut inner, &state.paths, Some(&app));

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
            eprintln!("[ipc] {channel} panicked: {detail}");
            Err(error::AppError::internal(format!("Command failed: {detail}")))
        }
    };

    if !ctx.db().is_autocommit() {
        let _ = ctx.db().execute_batch("ROLLBACK");
    }

    match result {
        Ok(data) => error::ok(data),
        Err(err) => {
            eprintln!("[ipc] {channel} failed: {err}");
            err.envelope()
        }
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

    let conn = match db::open(&paths.database) {
        Ok(conn) => conn,
        Err(err) => panic!("Cannot open {}: {err}", paths.database.display()),
    };
    if let Err(err) = db::migrate(&conn) {
        panic!("Database migration failed: {err}");
    }
    if let Err(err) = db::seed::seed_permissions(&conn) {
        panic!("Seeding the permission catalog failed: {err}");
    }

    // Restore the remembered login before the window loads, so the renderer's
    // first status call does not flash the login screen.
    let session = match identity::app::restore_remembered_login(&conn) {
        Ok(session) => session,
        Err(err) => {
            eprintln!("[startup] remembered login not restored: {err}");
            None
        }
    };

    let app_state = state::AppState::new(conn, session, paths);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![rpc])
        .run(tauri::generate_context!())
        .expect("error while running Crown Books");
}
