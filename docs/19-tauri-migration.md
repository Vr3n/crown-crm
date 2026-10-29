# Tauri migration

Status: implemented
Branch: `feat/tauri-migration`
Target: Windows x64, Tauri 2 + WebView2 + bundled SQLite

## 1. Why

The Electron build was trimmed to a 94.65 MB installer and a 327.02 MB install
(`18-windows-build-size.md`), but almost all of that is the Chromium runtime:
55 locale packs, the V8 snapshot, the GPU helper, and a full Node.js runtime the
app only uses to open one SQLite file.

Windows already ships a Chromium engine, and the backend is a thin SQL +
business-rules layer. Moving the shell to Tauri keeps the React UI unchanged and
replaces the Node backend with Rust, so the shipped payload becomes the app
binary plus WebView2.

## 2. What stayed the same

* `src/renderer` — every page, component, query and style. Not one visual change.
* `src/shared` — the contracts (`zod` schemas, TypeScript types, money and
  numbering helpers) are still imported by the renderer.
* Every IPC channel name in `src/shared/contracts/ipc.channels.ts`.
* The `window.api` surface. `AuthGate`, `ReportsPage`, `VoucherEntryPage` and the
  other 26 call sites were not edited.
* The database file, its path (`%APPDATA%\Crown Books\crown-books.db`), its
  schema, the four migrations, the scrypt password hashes, the seeded roles and
  chart of accounts, and the `machine.lock` install binding.
* The error catalogue: the renderer still branches on `error.code`.

That means an existing install upgrades in place: the same database file is
opened, migrated to the same version, and every stored row keeps working.

## 3. What changed

### 3.1 One command instead of 76 IPC handlers

`src-tauri/src/lib.rs` exposes exactly one Tauri command:

```rust
#[tauri::command(async)]
fn rpc(app, state, channel: String, args: Vec<Value>) -> Value
```

It resolves the channel against the same strings the preload bridge used
(`"vouchers:post"`, `"reports:trialBalance"`, …), dispatches to the owning Rust
module, and answers with the Electron envelope:

```json
{ "ok": true,  "data": … }
{ "ok": false, "error": { "code": "VOUCHER_UNBALANCED", "message": "…" } }
```

Failures are *values*, not rejected promises, so the renderer's `call()` helper
and every `catch (error) { error.code }` branch keep working.

### 3.2 The renderer owns the bridge

`src/preload/index.ts` is gone. `src/renderer/src/api/index.ts` holds the same
object, with

```ts
const result = await invoke('rpc', { channel, args })
```

and `src/renderer/src/main.tsx` publishes it as `window.api`. The global type
moved to `src/renderer/src/api/window.d.ts`, so the renderer no longer depends on
any preload or Electron type.

### 3.3 Rust modules

| Module | Channels | Notes |
|---|---|---|
| `identity` | 9 | setup, login, session, company, staff creation |
| `access` | 8 | staff, roles, permissions, privilege guards |
| `masters` | 23 | parties, items, accounts, units, tax rates, godowns |
| `numbering` | 2 | series, tokens, sequence allocation |
| `vouchers` | 7 | posting, GST, stock, settlement, invoice document |
| `reports` | 10 | trial balance, P&L, balance sheet, ageing, registers, stock |
| `dashboard` | 1 | summary |
| `summaries` | 3 | party, item and voucher page summaries |
| `search` | 1 | global search |
| `export` | 4 | XLSX, CSV, report print, invoice PDF |
| `backup` | 6 | create, list, destinations, reveal |
| `license` | 1 | machine install lock |

`rpc/mod.rs` asks each module in turn and the module returns `None` for channels
it does not own, so adding a domain never touches the dispatcher's list twice.

### 3.4 Transactions

Electron used a module-level connection and `withTransaction()` (with nested
savepoints). Rust keeps the same shape: one `rusqlite::Connection` behind a
`Mutex` in `AppState`, and `Ctx::with_tx()` opens `BEGIN IMMEDIATE` at the
outermost level and `SAVEPOINT` when nested. A posting is still a single
transaction: number, voucher, lines, stock, allocations, audit.

### 3.5 Passwords

scrypt with N=2^14, r=8, p=1 and a 64-byte key, salt = the ASCII bytes of a
16-byte hex salt, stored `salt:hash`. This is byte-for-byte the Electron scheme,
so users sign in with their existing password.

### 3.6 Native dialogs, shell and PDFs

Electron called `dialog.showSaveDialog`, `shell.showItemInFolder` and
`webContents.printToPDF`. Tauri equivalents:

| Electron | Tauri |
|---|---|
| `dialog.showSaveDialog` | `tauri-plugin-dialog` `blocking_save_file` |
| `dialog.showOpenDialog` (folder) | `blocking_pick_folder` |
| `shell.showItemInFolder` | `tauri-plugin-opener` `reveal_item_in_dir` |
| `shell.openPath` | `opener().open_path` |
| `webContents.printToPDF` (invoice) | `printpdf` — a real invoice PDF built from the invoice document |
| `webContents.printToPDF` (reports) | `WebviewWindow::print()` — the native print dialog, "Save as PDF" |

The report PDF is the one place where behaviour differs on purpose: a webview
cannot rasterise itself to a file, so the user gets the platform print dialog
instead of a save dialog. The print stylesheet is unchanged, so what lands on
paper is identical.

### 3.7 Packaging

`tauri.conf.json`:

* NSIS, per machine, English, `embedBootstrapper` (offline installs still work).
* `installerHooks: "installer-hooks.nsh"` writes `machine.lock` from
  `HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid` at install time, using
  Tauri's `NSIS_HOOK_POSTINSTALL`. This replaces electron-builder's
  `scripts/install-binding.nsh`.
* Release profile: `lto = true`, `codegen-units = 1`, `opt-level = "s"`,
  `strip = true`.

## 4. Layout

```
src-tauri/
  Cargo.toml
  build.rs                 tauri-build + the test-binary manifest
  tauri.conf.json          window, CSP, NSIS bundle
  capabilities/default.json
  installer-hooks.nsh      machine.lock at install time
  migrations/0000..0003    verbatim copies of the Drizzle SQL
  src/
    lib.rs                 startup + the single `rpc` command
    state.rs               AppState, Session, Ctx, with_tx
    error.rs               error codes + envelope
    json.rs                argument helpers
    paths.rs               %APPDATA%\Crown Books
    auth/                  scrypt
    db/                    open, migrate, seed, permission catalog
    audit.rs               append-only audit trail
    <domain>/              one module per backend area
  tests/rpc_flow.rs        end-to-end backend test
```

`src-tauri/PORTING.md` documents the conventions used for every module.

## 5. Verification

`cargo test` runs the unit tests plus `tests/rpc_flow.rs`, which drives the real
dispatcher against a real SQLite file:

1. `identity:status` → `SETUP_REQUIRED`
2. `identity:setup` → session, 31 permissions, five seeded roles
3. masters: units, accounts, tax rates, godowns, a party, an item
4. `vouchers:postOpening` → stock enters the ledger
5. `vouchers:post` a sales invoice → `INV/0001`, 200.00 taxable, 18% GST, 236.00
6. idempotent replay returns the same voucher; a tampered replay is
   `IDEMPOTENCY_CONFLICT`
7. trial balance balances, P&L nets 40.00, balance sheet difference is zero
8. receivables, payables, ageing buckets, party statement, sales register,
   stock and stock movements
9. dashboard, page summaries, global search
10. backup create/list, `license:status`
11. cancel, logout, wrong password, login
12. a second test proves every read channel answers `UNAUTHENTICATED` after
    logout
13. a third test reopens the database and restores the remembered login

### Windows test binaries

`rfd` (via `tauri-plugin-dialog`) imports `TaskDialogIndirect`, which exists only
in common-controls v6. Tauri embeds a v6 manifest in the application binary but
test binaries are separate link targets, so `build.rs` embeds
`tests.manifest` for them; without it the test executable dies at load with
`STATUS_ENTRYPOINT_NOT_FOUND`.

## 6. Size

| Artefact | Electron | Tauri | Change |
|---|---|---|---|
| Installer | 94.65 MB | **5.93 MB** (5.66 MiB) | −93.7% |
| Installed footprint | 327.02 MB | **11.86 MB** (11.31 MiB) | −96.4% |
| — `crown-books.exe` | — | 11.78 MB | |
| — `uninstall.exe` | — | 0.08 MB | |
| — `machine.lock` | — | 0.00004 MB | |
| — WebView2 | bundled Chromium (312.71 MB) | shared with Windows | |

Measured by installing the NSIS package into a throwaway per-user location,
reading `Get-ChildItem -Recurse | Measure-Object Length -Sum`, then uninstalling.
The installer also embeds a 1.80 MiB WebView2 bootstrapper that is deleted
after it runs, so it counts toward the installer but not the install.

## 7. Known differences

* **Report PDF** opens the print dialog (see 3.6).
* **Invoice PDF** is rendered by `printpdf` with the built-in Helvetica fonts, so
  the rupee sign prints as `Rs.` instead of `₹`, and the company logo is not
  embedded. Everything else — GSTIN, bill-to, HSN, tax split, totals in words,
  terms, signature — is on the page.
* **`identity:companyById`** is declared in the channel list but was never
  registered in Electron either; it still answers "unknown channel".
* **Dev runs** from `target/debug` have no `machine.lock` next to the binary, so
  `license:status` reports `NO_LOCK` (the app writes one at startup, like
  Electron did) unless `CROWN_BOOKS_E2E=1` is set.

### 7.1 Corrections made while porting

These were defects in the TypeScript that the port fixed, not new behaviour:

* **Voucher list paging** filtered `query`/`status` in memory *after* paging, so
  a search could return an empty page. Both filters now run in SQL.
* **Settlement** measured a bill's open balance from `from_voucher_id`, which is
  always empty for a bill, so the "allocated more than the bill" guard never
  fired. It now sums against `to_voucher_id`, the same direction `vouchers:outstanding`
  uses.
* **`ALLOCATION_EXCEEDS_PAYMENT`** is now returned for "allocated more than was
  received"; the old code reused `ALLOCATION_EXCEEDS_BILL`.
* **Posting** now rejects an inactive or foreign-company item/account with
  `CROSS_COMPANY_REFERENCE` / `ACCOUNT_NOT_POSTABLE`, and a sales or purchase
  voucher whose party has the wrong role with `PARTY_NOT_ALLOWED`, instead of a
  generic `INTERNAL_ERROR`.
* **`instrumentNo` and `reversalOfVoucherId`** were parsed and then dropped by
  the old post path; they are now stored.
