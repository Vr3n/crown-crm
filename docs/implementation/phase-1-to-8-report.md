# Implementation report: phases 1 to 8

Branch: `phase-1-masters`
Status: version 1 shipped on this branch, merged to `master`
Date: 21 October 2026

This report covers everything built after the Phase 0 foundation. It is written to be read with `docs/07-phase-plan.md`.

## 1. Phase scorecard

| Phase | Scope | Status |
|---|---|---|
| P1 Masters | Company settings, chart of accounts, parties, items, units, opening balances | Done |
| P2 Posting engine | Vouchers, ledger lines, stock movements, numbering, idempotency, cancellation, day book, trial balance | Done |
| P3 Debtors | Sales, receipts, allocations, credit notes, receivables, ageing, statement | Done |
| P4 Creditors | Purchases, payments, allocations, debit notes, payables, purchase register | Done |
| P5 Inventory | Stock summary, weighted average cost, COGS, opening stock, returns | Done |
| P6 Reports and GST | P&L, balance sheet, registers, trial balance, party statement, HSN on lines | Mostly done |
| P7 Banking | Contra voucher, cash and bank accounts | Partial, no CSV reconciliation or cheque printing |
| P8 Operations | Local backup, audit trail, roles, settings | Partial, no reminders, recurring invoices, attachments or multi-company switcher |
| P9 Extended parity | Quotations, orders, challans, payroll, e-invoice, TDS, cost centres, budgets | Not started |

The V1 cut line (creditors and debtors) is complete and covered end to end.

## 2. Posting engine

`src/main/domain/tax.ts` computes one line in integer paise:

1. gross = qty x rate
2. discount in basis points
3. taxable, with support for tax inclusive rates
4. CGST and SGST each computed on half the rate, or IGST for inter state
5. line total

`computeInvoiceTotals` sums lines and rounds the invoice to the rupee. Round off beyond one rupee is refused. `src/main/domain/posting.ts` maps a voucher type to ledger drafts and asserts that debits equal credits before anything is written.

`src/main/application/vouchers.ts` owns the transaction:

- resolves accounts by system key, never by name
- resolves the party's debtor and creditor accounts
- computes tax, stock movements and cost of goods sold
- validates allocations against the bill and the money received
- allocates the number inside the transaction
- inserts voucher, item lines, ledger lines, stock movements, allocations and the audit row
- returns the existing voucher when the request id was already used

Supported types: SALES, PURCHASE, RECEIPT, PAYMENT, CREDIT_NOTE, DEBIT_NOTE, JOURNAL, CONTRA, OPENING.

Cancellation sets the voucher to CANCELLED, writes an audit event and is refused when allocations exist. Every report reads only POSTED rows, so a cancelled document leaves the books immediately without a reversal duplicate.

Opening balances are posted once from stored party, account and item openings. The difference goes to `OPENING_DIFF` so the voucher still balances.

## 3. Money, stock and cost

- Money is integer paise end to end. No float is stored.
- Quantity is scaled by 10,000.
- Rates are basis points.
- Purchases debit Inventory at taxable value.
- Sales credit Inventory and debit COGS at the weighted average cost of posted movements.
- Sales returns bring stock back at the current average cost and reverse COGS.
- Purchase returns credit Inventory for goods, and Purchase Returns for services.
- Stock on hand is always `SUM(qty_in - qty_out)`; there is no quantity column.

## 4. API surface

The IPC channel list grew from 13 to 52, grouped as identity, parties, items, accounts, units, godowns, vouchers, reports, dashboard, license and backup. Every handler validates input with Zod and returns the shared result envelope.

New shared contracts: `masters.ts`, `vouchers.ts`, `reports.ts`. The preload bridge exposes typed namespaces and is injected with `contextBridge.exposeInMainWorld('api', api)`. The missing exposure was found by the Playwright test and fixed.

## 5. Screens

| Screen | Notes |
|---|---|
| Company | Profile, GSTIN, state, financial year, costing, rounding, terms, opening balance posting |
| Chart of accounts | Grouped list, system key badges, balances, new account |
| Parties | Search, role filter, Dr/Cr balance, credit terms, signed opening balance |
| Items | HSN, unit, GST, prices, stock, opening quantity, service flag |
| Sales and purchases | Paper voucher layout, item grid, live totals, post and navigate |
| Receipts and payments | Outstanding bills, allocation grid, over-allocation guard |
| Voucher detail | Lines, totals, allocations, print, cancel with reason |
| Day book and voucher lists | Date range, search, totals footer |
| Reports | Receivables, payables, ageing, trial balance, P&L, balance sheet, registers |
| Stock summary | Quantity and value by item |
| Journals | Manual journal with balance guard, contra |
| Backup | Create a checkpointed copy, list previous backups |

The voucher entry page mirrors the engine's arithmetic locally for the preview; the posted totals come from the server.

## 6. Tests

180 unit and integration tests across 18 files, plus 3 Playwright Electron tests.

| Area | Coverage |
|---|---|
| Migrations and constraints | 25 tables, one-side ledger, one-direction stock, unique voucher numbers |
| Seed | chart of accounts, system keys, units, GST rates, roles, idempotency |
| Identity | setup, login, staff, permissions, company updates |
| Tax and money | rounding, inclusive rates, split, financial year |
| Posting | purchase totals, sample sale 4,550.00, allocation guard, idempotency, journal balance, cancellation |
| Reports | trial balance, P&L, balance sheet, receivables, ageing, statement |
| E2E | first run, masters by IPC, purchase, sale, receipt with allocation, receivables, trial balance, stock, day book, restart persistence |

Commands:

```
npm run typecheck      clean
npx eslint src tests   0 errors
npx vitest run         180 passed
npm run build          main, preload, renderer
npx playwright test    3 passed
```

## 7. Decisions

1. **Cancellation is a status change, not a mirror voucher.** Reports read POSTED rows only, so a cancelled bill disappears from receivables and the trial balance without duplicating the reversal. The original stays visible in the day book and the audit table. This is a deliberate simplification of the deck's mirror model and is recorded here.
2. **Purchase returns credit Inventory for goods.** This keeps the stock ledger and the inventory account consistent at taxable cost.
3. **Average cost is computed from posted movements** and falls back to the item purchase price before any stock exists.
4. **Draft vouchers are not exposed in V1.** Posting is atomic; a draft state exists in the schema for later.
5. **Banking is limited to contra.** Reconciliation and cheque printing are deferred.
6. **Backup restore is manual.** A live SQLite swap needs the app closed, so the screen documents the file operation instead of automating risk.
7. **The test hook `CROWN_BOOKS_E2E` and `CROWN_BOOKS_USER_DATA`** are only used by the Playwright launcher: the first bypasses the installer lock, the second isolates the database.

## 8. Known gaps

- P7: no bank CSV import, matching, reconciliation or cheque printing.
- P8: no payment reminders, recurring invoices, attachments, multi-company switcher or automatic backups.
- P9: no quotations, orders, delivery challans, purchase orders, payroll, e-invoice, e-way bill, cost centres, budgets, TDS or multi currency.
- GST filing working papers (GSTR-1, GSTR-3B, HSN summary) are not built; the registers provide the raw data.
- Party statements exist through IPC but do not have a dedicated screen.
- Payment method selection is captured but not stored on the receipt voucher.
- Serial numbers are not collected.

## 9. File map

```
src/main/domain/tax.ts              GST line and invoice totals
src/main/domain/posting.ts          voucher type to ledger drafts
src/main/application/masters.ts     party, item, account commands
src/main/application/vouchers.ts    posting, cancellation, opening balances
src/main/application/reports.ts     P&L, balance sheet, receivables, ageing, registers
src/main/repositories/masters.ts    masters and weighted average cost
src/main/repositories/vouchers.ts   document persistence and outstanding
src/main/repositories/reports.ts    report SQL
src/main/ipc/masters.ts             master channels
src/main/ipc/vouchers.ts            voucher channels
src/main/ipc/reports.ts             report channels
src/main/ipc/backup.ts              checkpointed file backup
src/renderer/src/features/parties/  party list and form
src/renderer/src/features/items/    item list and form
src/renderer/src/features/accounts/ chart of accounts
src/renderer/src/features/company/  company settings and opening balances
src/renderer/src/features/vouchers/ entry, list and detail
src/renderer/src/features/reports/  report screens
src/renderer/src/features/stock/    stock summary
src/renderer/src/features/journals/ journal and contra
src/renderer/src/features/backup/   backup screen
tests/e2e/v1-flow.spec.ts           full business flow
```
