# Release: 0.1.0 Excel importer prototype

Status: prerelease, built from `feat/excel-importer`
Tag: `v0.1.0-excel-importer.1`
Release page: <https://github.com/Vr3n/crown-crm/releases/tag/v0.1.0-excel-importer.1>

## Assets

| Asset | Purpose |
|---|---|
| `Crown Books_0.1.0_x64-setup.exe` | Windows x64 NSIS installer, per-machine. |
| `sample-bills-from-pdfs.xlsx` | The purchase and sales sample built from the two PDFs. |

The installer uses the existing `Crown Books` application data directory. The
company, database, backups and logs are kept.

## What the release contains

- The Excel importer at **Books → Import from Excel**.
- The sample workbook and its generator.
- Structured JSONL logging in the renderer and Rust, with one trace id per
  operation.
- The logs CLI in `scripts/logs.mjs`.
- A 30 second per-bill timeout so a stuck IPC call becomes a failed bill.

## Verification

| Check | Result |
|---|---|
| `npm test` | 254 passed, 1 skipped |
| `cargo test` | 73 unit, 2 full-flow, 5 RPC-flow passed |
| `npm run typecheck` | clean |
| `npm run build` | NSIS installer, 5.87 MiB |
| `node scripts/smoke-ui.mjs` | every screen and flow passed, including the sample import, the backend read-back and the log file |

The smoke run imported the sample purchase bill for **₹15,545.00**, read the
posted voucher back from `vouchers.list`, and found `run.finish` and `post.ok`
records in the JSONL log.

## Reproduce

```bash
npm ci
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
node scripts/smoke-ui.mjs
```

The installer is written to
`src-tauri/target/release/bundle/nsis/Crown Books_0.1.0_x64-setup.exe`.

## Install

1. Close any running Crown Books window.
2. Run the setup. Windows may ask for administrator because the installer is
   per-machine.
3. Sign in, then open **Books → Import from Excel**.

## Known limits

- The importer is one-way. It reads the workbook and posts vouchers to SQLite.
  It does not write back to the `.xlsx`.
- Sales re-imports are not de-duplicated. Purchase bills are protected by the
  supplier bill number.
- Merged headers and two-row headers are not handled.
- Party and item creation need the matching permissions.
- This is a prototype, not a stable release. The PR is
  <https://github.com/Vr3n/crown-crm/pull/40>.
