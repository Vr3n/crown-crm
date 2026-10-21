# Phase plan

Status: approved direction
Assumption: one focused developer with agent support, 8 working weeks for version 1.

## 1. Phase overview

| Phase | Name | Effort | Depends on | Ships |
|---|---|---|---|---|
| P0 | De-gym, rename, shell | 1 week | none | Empty Crown Books shell |
| P1 | Company, accounts, masters | 1.5 weeks | P0 | A company with parties and items |
| P2 | Voucher engine | 2 weeks | P1 | Posting, day book, ledger, trial balance |
| P3 | Debtors | 1.5 weeks | P2 | Sales, receipts, ageing, statements |
| P4 | Creditors | 1 week | P3 | Purchases, payments, payables |
| P5 | Inventory reports | 2 weeks | P4 | Stock summary, journals, counts |
| P6 | Reports and GST | 1.5 weeks | P5 | P&L, balance sheet, GST working papers |
| P7 | Banking | 1.5 weeks | P6 | Reconciliation, contra, cheque |
| P8 | Operations | 2 weeks | P7 | Reminders, recurring, backup, multi-company |
| P9 | Extended parity | ongoing | P8 | Orders, challans, payroll-lite, e-invoice |

Version 1 is the end of P4. Everything after that is additive and can be reordered by customer feedback.

## 2. P0: de-gym, rename, shell

Objective: the codebase stops describing a gym and starts describing a books app.

Deliverables:

1. Delete gym modules, screens, contracts, repositories, IPC handlers and tests. Inventory in `08-refactor-inventory.md`.
2. Rename tenancy: `organizations` to `companies`, `organization_id` to `company_id`, `organization_staff` to `company_users`.
3. Replace the permission catalog with accounting codes.
4. New database file `crown-books.db`. Old file untouched.
5. Migration 32 creates the new schema and seeds groups, accounts, units, tax rates, roles.
6. New app shell: topbar, grouped left nav, empty dashboard, command palette stub.
7. Ledger Paper tokens replace the teal and pink gym theme.
8. Rename product strings, window title, installer metadata, database filename, README, AGENTS.md.
9. Recreate the two missing guideline documents referenced by AGENTS.md.

Exit criteria:

- The app boots to login with no gym word anywhere in the UI or the source (grep clean).
- `npm run typecheck`, `npm run lint`, `npm test` pass.
- A new database is created, seeded and inspected table by table.
- No dead imports, no unused dependencies, no orphan files.

## 3. P1: company, accounts, masters

Objective: everything a voucher needs exists before a voucher exists.

Deliverables:

1. Company profile screen: identity, GSTIN and state, financial year, books begin, logo, invoice terms, costing method, round off mode.
2. Chart of accounts: groups tree, accounts list, create and edit, reserved keys protected, parent accounts not postable.
3. Parties: list, detail, create, edit, deactivate, search by name phone GSTIN, opening balance.
4. Items: list, detail, create, edit, HSN, unit, GST rate, prices, service flag, opening stock, reorder level.
5. Units, stock groups, godowns, tax rates, voucher series screens.
6. Opening balance worksheet with a live "difference" figure and a posting action.
7. Shared form primitives: money input, quantity input, GST rate picker, party picker, item picker, date picker.

Exit criteria:

- A company can be set up from empty in under ten minutes following the onboarding checklist.
- 50 parties and 200 items can be created, searched and paginated without lag.
- Opening balances post as one balanced opening voucher, or refuse with a clear reason.
- Every master can be deactivated but not deleted once used.

## 4. P2: voucher engine

Objective: one place writes double entry, and nothing else does.

Deliverables:

1. Schema for vouchers, item lines, ledger lines, stock movements, allocations.
2. Domain module `posting/` with one rule per voucher type.
3. Posting service: validate, number, write lines, write movements, write audit, atomic.
4. Rounding and tax modules with exhaustive unit tests.
5. Idempotency on every mutating IPC.
6. Voucher list, voucher detail, day book, ledger, trial balance.
7. Cancellation with mirror voucher and audit.
8. Integrity report screen (hidden under Admin).
9. Golden fixtures for both sample bills.

Exit criteria:

- Both sample bills post to the exact totals in `03-voucher-posting-rules.md`.
- Property test: 1,000 random voucher sets, every one balances.
- Double submit with the same idempotency key writes one voucher.
- A failed post leaves no rows, no consumed number, no audit noise.
- Trial balance shows a green check after every test scenario.

This is the gate. Do not start P3 until P2 is boring.

## 5. P3: debtors

Objective: a shop can bill a customer, take money and chase the balance.

Deliverables:

1. Sales entry screen with the item grid and live totals.
2. Tax inclusive and exclusive entry per line.
3. Place of supply selector defaulting to the party state.
4. Due date from credit days, with override.
5. Credit limit warning at post time.
6. Credit note screen, linked to an invoice.
7. Receipt screen with outstanding bill picker and allocation grid.
8. Advance and on account handling.
9. Customers list with balance, party detail with statement and bills.
10. Receivables and ageing reports with drill down.
11. Tax invoice PDF and statement PDF.

Exit criteria:

- Create invoice 4,550, receive 2,000 split across two bills, watch outstanding and ageing update.
- Credit note reverses the sale, returns stock, and reduces the bill.
- Statement matches the ledger for the party.
- Printed invoice matches the sample layout field for field.

## 6. P4: creditors

Objective: the same loop on the supplier side.

Deliverables:

1. Purchase entry screen, including multi line discount percentages.
2. Supplier bill attachment later (phase 8), reference number now.
3. Debit note screen.
4. Payment screen with bill allocation.
5. Suppliers list, detail, statement.
6. Payables and ageing reports.
7. Purchase register.

Exit criteria:

- Purchase bill TC/2026-27/583 posts to 15,545.00 with the tax split documented.
- Partial payment updates the ageing bucket.
- Supplier statement and payables report agree.
- Version 1 acceptance script passes end to end in a fresh install.

## 7. P5: inventory reports

Objective: the stock that version 1 already records becomes visible and correctable.

Deliverables:

1. Stock summary: quantity and value by item and godown.
2. Item movement report.
3. Negative stock report.
4. Stock journal for godown transfers.
5. Physical stock count with adjustment posting.
6. NRV write down.
7. Costing method switch with a warning and a revaluation path.
8. Serial number register for items that track serials.

Exit criteria:

- Inventory ledger balance equals the sum of quantity times cost at all times.
- A count adjustment posts the difference, never overwrites.
- FIFO and weighted average reproduce the textbook examples in the inventory deck.
- A negative stock list is empty after a clean purchase and sale cycle.

## 8. P6: reports and GST

Objective: the accountant can close a month without Excel.

Deliverables:

1. Profit and loss with drill down.
2. Balance sheet that must balance.
3. Cash and bank book.
4. Sales and purchase registers, invoice wise and rate wise.
5. GSTR-1 working export.
6. GSTR-3B working with output tax, input credit and net payable.
7. HSN summary.
8. Period lock and year end closing entry.
9. Excel export for every report.

Exit criteria:

- Every report ties to the trial balance.
- GSTR-3B net payable equals output tax minus input tax from ledger lines.
- Closing a year locks it and refuses back dated posts.
- Exports open in Excel with correct numbers and formulas.

## 9. P7: banking

Objective: the bank column in the books agrees with the bank statement.

Deliverables:

1. Bank accounts as ledger accounts, with opening balance and account number.
2. Contra voucher screen.
3. CSV import with column mapping.
4. Manual and assisted matching against book entries.
5. Unreconciled and reconciled views.
6. Cheque printing layout.
7. Bank book report.

Exit criteria:

- Import a statement, match every line, reconciled balance equals the statement.
- Unmatched lines remain visible and explainable.
- Cheque print aligns on a preprinted sheet within tolerance.

## 10. P8: operations

Objective: the app survives daily use by a real shop for a year.

Deliverables:

1. Payment reminders: printable, WhatsApp text, email text, with templates.
2. Recurring invoices for rent and retainers.
3. Document attachments per voucher (scanned bill, cheque image).
4. Audit trail viewer per entity.
5. Daily automatic backup with retention policy, manual backup and restore.
6. Credit limit and party hold workflow.
7. Multi-company switcher and per-company roles.
8. Role refinement: owner, accountant, billing clerk, auditor.
9. Onboarding wizard with optional sample data.

Exit criteria:

- Restore from backup reproduces every report exactly.
- Two companies never share a row, a report or a number series.
- An auditor can read everything and change nothing.
- Reminder templates render correctly in print and in a messaging app.

## 11. P9: extended parity

Prioritised after P8 by real customer requests.

Candidates, roughly in order of expected value:

1. Quotation to sales order to delivery challan to invoice.
2. Purchase order and goods receipt.
3. Expense vouchers with categories.
4. Payroll-lite: salary journal, attendance import, payslip.
5. e-invoice JSON and IRN integration.
6. e-way bill JSON.
7. Cost centres and cost categories.
8. Budgets and variance.
9. TDS and TCS.
10. Multi currency with exchange snapshots.
11. Interest on overdue bills.
12. Ratio analysis and cash flow projection.

## 12. Cross phase definition of done

A phase is done when all of these are true:

- Feature works from the UI, not just from tests.
- Unit tests cover the domain rules added in the phase.
- Integration test covers the main transaction end to end.
- Migration tested from empty and from the previous version.
- Empty, loading and error states exist.
- Keyboard path works for the primary task.
- Permission codes exist and are enforced in the command layer.
- Docs updated: schema, posting rules, report spec, phase notes.
- No new lint warnings, no `any` escapes in new code.
- A second developer can run the acceptance script from the docs.

## 13. Decision log

Decisions that must be settled before the phase that needs them.

| # | Decision | Needed by | Default if nobody decides |
|---|---|---|---|
| 1 | Product name | P0 | Crown Books |
| 2 | Keep commercial licensing | P0 | Keep, unchanged |
| 3 | Purchase accounting: inventory asset or expense | P2 | Inventory asset, perpetual |
| 4 | Allow back dated vouchers | P2 | Yes, within the open year |
| 5 | Manual voucher numbers | P2 | Off by default |
| 6 | Negative stock policy | P2 | Allowed with warning |
| 7 | Rounding mode | P2 | Invoice level |
| 8 | Alteration of posted vouchers | P2 | Never, cancel and reissue |
| 9 | Credit note against a specific bill | P3 | Required when a bill exists |
| 10 | Statement frequency and format | P3 | On demand, A4 |
| 11 | GST filing scope for v1 | P6 | Working papers and export only, no direct filing |

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Tax rounding disputes | High | Medium | One rounding module, documented policy, round off account, golden tests |
| Scope creep from "Tally does X" | High | High | The V1 cut line in `00-product-brief.md` is contractual |
| Data loss during the rewrite | Low | High | New database file, old file untouched, backup before first run |
| Clerk rejects keyboard model | Medium | High | Usability run in P3 with a real clerk, before P4 |
| Report performance on five years of data | Medium | Medium | Seed 50k vouchers in a test database, measure in P2 |
| GST rule changes | Medium | Low | Rates and HSN as data rows |
| Multi-company added late | Low | Medium | `company_id` on every table from day one |
