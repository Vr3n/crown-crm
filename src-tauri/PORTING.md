# Porting conventions (Electron → Tauri/Rust)

The Rust backend mirrors `src/main/**` (TypeScript). Read the TS implementation
first, then port it. Behaviour, validation messages and JSON field names must
stay identical — the React renderer is unchanged.

## Module shape

Each domain lives in `src-tauri/src/<module>/`:

```
<module>/mod.rs    dispatch() + command fns
<module>/repo.rs   SQL (optional, when the module is large)
```

Only edit files inside your own module directory. `rpc/mod.rs`, `state.rs`,
`error.rs`, `json.rs`, `db/*` and `Cargo.toml` are owned by the integration
step; if you need a change there, say so in your final summary instead of
editing.

## Dispatch

```rust
pub fn dispatch(ctx: &mut Ctx<'_>, channel: &str, args: &[Value]) -> Option<AppResult<Value>> {
    match channel {
        "parties:list" => Some(list_parties(ctx, arg(args, 0))),
        _ => None,
    }
}
```

Return `None` for channels you do not own. Never `unwrap()`/`expect()` on user
input or SQL — return `AppError`.

## Arguments and results

* The renderer calls `invoke('rpc', { channel, args })`. `args` is positional:
  `window.api.parties.get(id)` sends `[{ id }]`, so `arg(args, 0)` is the payload.
* `crate::json` has the accessors: `arg`, `field`, `opt_str`, `opt_trimmed`,
  `req_str`, `req_i64`, `opt_i64`, `opt_bool`, `array`, `required_text`,
  `optional_text`, `int_in_range`, `patch_str`.
* Results are `serde_json::json!` values with **camelCase** keys matching the
  TypeScript contract interfaces in `src/shared/contracts/*.ts`. Nullable
  columns must be `null`, not omitted (use `Option<T>` in `json!`).
* Booleans come out of SQLite as `0`/`1`; convert with `row.get::<_, i64>(i)? != 0`.

## Errors

`crate::error::{AppError, AppResult}` with `codes::*`. Map the TS error classes:

| TS                        | Rust                                        |
| ------------------------- | ------------------------------------------- |
| `ValidationError`         | `AppError::validation(msg)`                 |
| `NotFoundError`           | `AppError::not_found(msg)`                  |
| `ConflictError`           | `AppError::conflict(msg)`                   |
| `UnauthorizedError`       | `AppError::unauthenticated(msg)`            |
| `ForbiddenError(code)`    | `AppError::permission_denied(code)`         |
| domain-specific codes     | `AppError::new(codes::VOUCHER_UNBALANCED, …)` |

`?` on `rusqlite::Error` converts automatically (constraint violations become
`CONFLICT`).

## Session and permissions

`Ctx` exposes `db()`, `session()`, `company_id()`, `user_id()`,
`require_session()`, `require_permission(code)`, `has_permission(code)`,
`with_tx(|ctx| …)`, `paths`, `app`.

Call `ctx.require_permission(...)` exactly where the TS calls
`requirePermission(...)` — same permission code, same order relative to
validation. Codes live in `crate::db::permissions::codes`.

`require_any_permission` is not ported; write
`if !ctx.has_permission(a) && !ctx.has_permission(b) { return Err(permission_denied(a)) }`.

## Transactions

TS `withTransaction(() => …)` becomes `ctx.with_tx(|ctx| { … Ok(value) })?`.
Nested calls create SAVEPOINTs, so a repository helper may also wrap itself.
Everything that writes must run inside `with_tx`.

If you already hold `&mut Connection` (not `Ctx`), use the free functions in
`crate::state` or plain `conn.execute`, and have the caller own the
transaction.

## Money and quantities

* Money: integer **paise**.
* Quantity: integer scaled by **10,000**.
* Rates: **basis points** (18% = 1800).
* Never use floats for money. `src/shared/contracts/money.ts` has the helpers;
  port the arithmetic you need as integer math.

## Dates

* `YYYY-MM-DD` for business dates (`crate::state::today_iso()`).
* `YYYY-MM-DD HH:MM:SS` UTC for timestamps (`crate::state::now_sqlite()`).
* Financial year helpers live in `crate::numbering::financial_year_label`.

## Dialogs, files, shell

`ctx.app: &tauri::AppHandle` is available.

```rust
use tauri_plugin_dialog::DialogExt;
let picked = ctx.app.dialog().file()
    .set_title("Save spreadsheet")
    .set_file_name("report.xlsx")
    .add_filter("Excel workbook", &["xlsx"])
    .blocking_save_file();
```

`blocking_*` is safe here because `rpc` is an `async` command (worker thread).
Reveal a saved file/folder with
`tauri_plugin_opener::OpenerExt` → `ctx.app.opener().reveal_item_in_dir(path)`.

Commands that only touch the filesystem must still check permissions first.

## Already implemented (do not duplicate)

* `crate::identity` — setup, login, session, company, staff creation.
* `crate::access` — staff/roles/permissions, privilege guards
  (`access::guards`).
* `crate::numbering` — settings, validation, `allocate_number`, `list`,
  `ensure_defaults`, `financial_year_label`, `format_number`,
  `validate_setting`.
* `crate::audit::record` — append-only audit trail.
* `crate::db::seed` — company defaults.
* `crate::state::{today_iso, now_sqlite}`.

## Checklist before you finish

1. Every channel your module owns is handled; unknown channels return `None`.
2. Every TS `requirePermission` has a Rust equivalent.
3. Output field names and nullability match the contract interfaces.
4. No `unwrap`/`expect`/`panic!` on request data.
5. `cargo check --manifest-path src-tauri/Cargo.toml` is clean if you can run it
   (another build may hold the lock — then at least re-read your code).
