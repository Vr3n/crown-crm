# Crown Books

**Offline-first books for small businesses on Windows.** Creditors, debtors, GST bills and stock on your own machine.

Crown Books replaces the gym CRM this repository started as (CrownCRM). The product is now a double-entry accounting application for small and medium trading or service businesses: the daily work a shop does in TallyPrime or QuickBooks, without the cloud.

Status: design and planning. No accounting code is implemented yet. The documents in `docs/` are the specification the build follows.

## What version 1 does

- Company profile with GSTIN, state, financial year and invoice terms
- Chart of accounts, parties (customer, supplier, or both), items with HSN and GST
- GST sales invoices and purchase bills with multi line entry, discount, tax inclusive or exclusive rates, CGST/SGST or IGST, and round off
- Receipts and payments applied against specific bills, plus advances and on account money
- Credit notes and debit notes for returns
- Receivables, payables, ageing, party statements, day book, ledger, trial balance, profit and loss, balance sheet
- Print and PDF: tax invoice, statement of account
- Roles: owner, accountant, billing clerk, auditor
- Local database, local backup, no telemetry

## What version 1 does not do

Sales pipeline, memberships, plans and offers are deleted, not hidden. Inventory reports, GST filing working papers, bank reconciliation, reminders and e-invoicing come in later phases. See `docs/00-product-brief.md` for the cut line.

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
| `docs/backend-implementation-guidelines.md` | How to add a feature |
| `docs/form-implementation-guideline.md` | How to build a capture form |
| `docs/presentations/` | Two stakeholder decks (HTML) |

The source decks and sample bills that defined the domain stay in `docs/` as reference material.

## Built with

- Electron + electron-vite
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- TanStack Query, Form and Table
- SQLite through Node's built in `node:sqlite`, with Drizzle ORM
- Zod at the IPC boundary
- Vitest and Playwright

## Prerequisites

- Node.js 20 or newer, for `node:sqlite`
- Windows for the packaged installer; development runs on Windows, macOS and Linux

## Getting started

```bash
npm install
npm run dev
```

On first launch the setup screen asks for the company profile and the owner account.

## Building

```bash
npm run build        # typecheck and bundle
npm start            # run the built app
npm run build:win    # Windows installer
```

## Quality

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

## Data

The application writes `crown-books.db` in the Electron user data folder. The previous gym database file is left untouched on disk and is not read by this application.
