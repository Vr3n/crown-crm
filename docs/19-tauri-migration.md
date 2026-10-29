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

### 3.8 CI and releases

Both GitHub workflows now build the Tauri app. They install
`dtolnay/rust-toolchain@stable`, cache `src-tauri` with `swatinem/rust-cache`,
then run the same gates as before (`typecheck`, Vitest) plus
`cargo test --manifest-path src-tauri/Cargo.toml`, and finish with
`npm run build`. The installer artifact comes from
`src-tauri/target/release/bundle/nsis/*-setup.exe`.

`semantic-release` used to run `electron-vite build && electron-builder`. It now
runs three steps in `prepareCmd`:

1. `scripts/sync-version.mjs` copies the version npm just bumped into
   `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, so the git tag, the
   `package.json` version and the bundled installer agree (`Cargo.lock` follows
   on the next build).
2. `npm run build` produces the NSIS installer.
3. `scripts/collect-installer.mjs` copies the newest installer to
   `dist/Crown-Books-<version>-setup.exe`, which is the GitHub release asset.

`@semantic-release/git` also commits the two manifests, and the Electron-only
`afterPack`/`applyFuses` hooks, the `build/` icon bundle and the gym-era EULA
that lived in it are gone. `scripts/guide/capture-*.mjs` still drive Electron
through Playwright; they are documentation tooling only and need porting before
the guide PDFs can be regenerated.

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
  tests/common/mod.rs       shared harness (temp database + dispatcher)
  tests/rpc_flow.rs         boot, setup, one invoice, reports, login
  tests/full_flow.rs        every feature in one realistic month of trading

vite.config.ts             renderer-only bundle (root src/renderer)
scripts/smoke-tauri.mjs    packaged-binary smoke test
scripts/smoke-ui.mjs       full UI walkthrough over the DevTools protocol
scripts/sync-version.mjs   semantic-release -> Cargo.toml + tauri.conf.json
scripts/collect-installer.mjs  newest NSIS installer -> dist/Crown-Books-<v>-setup.exe
```

`src-tauri/PORTING.md` documents the conventions used for every module.

## 5. Verification

`cargo test` runs 51 unit tests plus two end-to-end suites that drive the real
dispatcher against a real SQLite file.

### `tests/full_flow.rs` — every feature

One company is set up and taken through the whole product. The arithmetic is
asserted exactly, so the ledger, the stock ledger and the reports have to agree.

1. **Identity and access.** First-run status, `checkCompanyExists`, setup,
   company profile edits (legal name, PAN, address, round-off mode, negative
   stock), GSTIN/PAN validation, role create/update/delete, the system-role
   guard, staff create/update/password reset, signing in as the limited role,
   `PERMISSION_DENIED` on a write it lacks, the privilege-escalation guard, then
   back to the owner.
2. **Masters.** Units create/update/deactivate (active vs `includeInactive`),
   accounts groups/create/deactivate, parties create/update/list filters/get/
   deactivate, items create/update/list/deactivate, tax rates create/revise/
   retire with the append-only history, godowns.
3. **Numbering.** The nine seeded series, a custom prefix `SINV/{FY}/` with
   three-digit padding, and rejection of an invalid series and an unknown token.
4. **Opening balances.** `vouchers:postOpening` moves the declared account,
   party and stock openings into the ledger. Items report `stockQtyE4 = 0`
   before that and the real quantity after, exactly like the product.
5. **All nine voucher types.** Sales intra-state (CGST+SGST), sales inter-state
   with a 10% discount, manual numbering, and round off (955.80 → 956.00),
   a service sale with no stock movement, a purchase bill with 12% IGST, a
   receipt settled against a bill, a payment against a bill, a credit note that
   returns stock and reverses COGS, a debit note that is then cancelled, a
   balanced journal and a cash-to-bank contra.
6. **Invariants.** The trial balance balances, cash carries the receipt and the
   contra, the first bill shows 100.00 paid and 136.00 open, a bill with an
   allocation cannot be cancelled, cancelling the debit note restores the unit
   (`stockQtyE4` 15 → 16 units for the month), and a second cancel is refused.
7. **Lists.** Filters by type, party and date range, a number search, paging,
   and the invoice read model (nested company, party, totals, tax slabs, amount
   in words) — including `NOT_FOUND` for a journal, which has no invoice.
8. **Reports.** Profit and loss (income 1415.00), balance sheet (difference 0),
   receivables, payables (496.00), ageing buckets, party statement with a
   running balance, sales and purchase registers, stock (16 units, valued) and
   stock movements with the per-voucher unit cost.
9. **Dashboard, summaries, search.** Bill-based receivables (1682.00) and
   payables, the five-bucket ageing, four party rows and three item rows, the
   party page's ledger-based balances (2064.00 / 496.00), items and voucher
   summaries with a month point per month that has data, and global search by
   party and item name.
10. **Exports.** The real `rust_xlsxwriter` workbook (a zip, `PK` magic) and the
    real `printpdf` invoice (`%PDF-` magic, default file name), plus the fact
    that the save-dialog commands report an error instead of writing silently
    when there is no window.
11. **Backup and licence.** Create (twice, distinct names), list, destinations,
    remove-unknown-destination, reveal-missing-folder, `license:status`.
12. **Error contract.** Unbalanced journal, receipt from a supplier, sale with
    no party, manual number on a series that forbids it, unknown voucher type,
    unknown channel, and every read channel answering `UNAUTHENTICATED` after
    logout.

`tests/rpc_flow.rs` covers the boot path and session restore, and
`rejected_vouchers_leave_no_trace` proves a refused post consumes no voucher
number and leaves no rows behind.

### Smoke tests against the built app

`npm run smoke:win` launches the built binary against a throwaway data directory
and asserts the database was created, four migrations ran, the 28 tables exist
and 31 permissions were seeded.

`npm run smoke:ui` starts the app with WebView2 remote debugging and drives the
real UI over the DevTools protocol: the first-run screen, setup, session
restore, the numbering wizard, the dashboard, all 27 routes, a party created
through the dialog (including the empty-form rejection), then an item, opening
balances, a posted invoice and the screens that read it — voucher detail,
receivables, trial balance, profit and loss, stock, company settings and the
two-copy GST print view.

### Windows test binaries

`rfd` (via `tauri-plugin-dialog`) imports `TaskDialogIndirect`, which exists only
in common-controls v6. Tauri embeds a v6 manifest in the application binary but
test binaries are separate link targets, so `build.rs` embeds
`tests.manifest` for them; without it the test executable dies at load with
`STATUS_ENTRYPOINT_NOT_FOUND`.

## 6. Size

| Artefact | Electron | Tauri | Change |
|---|---|---|---|
| Installer | 94.65 MB | **5.94 MB** (5.66 MiB) | −93.7% |
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
* **Opening balances were counted twice.** The trial balance and the P&L added
  `accounts.opening_balance_minor` to the ledger sum, while the opening voucher
  posted the same figure into the ledger. Any custom account with an opening
  balance made the trial balance disagree by that amount. Posting the opening
  voucher now clears the staging column, so the ledger is the single source of
  truth and the books balance.
