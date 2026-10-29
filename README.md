# Crown Books

**Offline-first books for small businesses on Windows.** Creditors, debtors, GST bills and stock on your own machine.

Crown Books replaces the gym CRM this repository started as (CrownCRM). The product is now a double-entry accounting application for small and medium trading or service businesses: the daily work a shop does in TallyPrime or QuickBooks, without the cloud.

Status: version 1 implemented. The documents in `docs/` are the specification the build follows; `docs/implementation/` records what shipped.

## What version 1 does

- Company profile with GSTIN, state, financial year and invoice terms
- Chart of accounts, parties (customer, supplier, or both), items with HSN and GST
- GST sales invoices and purchase bills with multi line entry, discount, tax inclusive or exclusive rates, CGST/SGST or IGST, and round off
- Receipts and payments applied against specific bills, plus advances and on account money
- Credit notes and debit notes for returns
- Receivables, payables, ageing, day book, ledger, trial balance, profit and loss, balance sheet
- Statement of account data through the report API
- Print: voucher detail with the company header
- Roles: owner, accountant, billing clerk, auditor
- Local database, local backup, no telemetry

## What version 1 does not do

Sales pipeline, memberships, plans and offers are deleted, not hidden. GST filing working papers, bank reconciliation, reminders, e-invoicing and the extended parity items in phase 9 are not built yet. See `docs/implementation/phase-1-to-8-report.md` for the precise gaps.

## Documentation

| Document | Contents |
|---|---|
| `docs/00-product-brief.md` | Scope, users, success measures |
| `docs/01-domain-model.md` | Vocabulary, entities, invariants |
| `docs/02-database-schema.md` | Tables, columns, indexes, migrations |
| `docs/03-voucher-posting-rules.md` | Dr/Cr rules and worked examples |
| `docs/04-tax-rounding-and-numbering.md` | GST split, rounding, series, idempotency |
| `docs/05-reports-spec.md` | Every report, column by column |
| `docs/06-design-system.md` | Ledger Paper tokens and screens |
| `docs/07-phase-plan.md` | P0 to P9, exit criteria, risks |
| `docs/08-refactor-inventory.md` | Exact files kept, deleted and added |
| `docs/09-testing-strategy.md` | Fixtures, property tests, CI gates |
| `docs/guides/crown-books-user-guide.pdf` | Step-by-step user guide for billing and accounts staff |
| `docs/guides/crown-books-10-minute-quick-start.pdf` | Seven-page printable quick start |
| `docs/backend-implementation-guidelines.md` | How to add a feature |
| `docs/form-implementation-guideline.md` | How to build a capture form |
| `docs/18-windows-build-size.md` | Electron payload budget and the trimming that preceded the Tauri move |
| `docs/19-tauri-migration.md` | Tauri architecture, the single RPC command, sizes, known differences |
| `docs/presentations/` | Two stakeholder decks (HTML) |

The source decks and sample bills that defined the domain stay in `docs/` as reference material.

## Built with

- Tauri 2 + Rust, WebView2 on Windows
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query, Form and Table
- SQLite through `rusqlite` (bundled), the same schema and migrations as before
- Zod at the IPC boundary
- Vitest for the renderer and shared contracts; `cargo test` for the backend

## Prerequisites

- Node.js 20 or newer
- Rust 1.77+ with the MSVC toolchain
- WebView2 runtime (installed on Windows 10/11; the installer can bootstrap it)
- Microsoft Visual Studio Build Tools with the C++ workload, for the Windows linker

## Getting started

```bash
npm install
npm run dev          # vite + cargo, opens the app
```

On first launch the setup screen asks for the company profile and the owner account.

## Building

```bash
npm run build        # release binary + NSIS installer in src-tauri/target/release/bundle
npm run build:web    # renderer bundle only, into dist/
```

## Testing

```bash
npm run typecheck
npm run lint
npm test             # renderer and shared-contract tests
cargo test --manifest-path src-tauri/Cargo.toml   # backend, including tests/rpc_flow.rs
npm run smoke:win    # launches the built binary and checks the migrated database
npm run smoke:ui     # attaches to the running window and checks React + the IPC bridge
```

## Data

The application writes `crown-books.db` to `%APPDATA%\Crown Books`, the same
folder the Electron build used, so an in-place upgrade keeps the books. The
previous gym database file is left untouched on disk and is not read by this
application.
