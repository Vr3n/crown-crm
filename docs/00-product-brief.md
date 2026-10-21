# Crown Books: product brief

Status: approved direction, pre-implementation
Owner: product
Supersedes: the gym membership CRM described in the previous README and AGENTS.md

## 1. What we are building

Crown Books is an offline-first Windows desktop application for the books of a small to medium trading or service business in India.

It does the work a shop owner, accountant or billing clerk does every day in TallyPrime or QuickBooks:

- record what customers owe (debtors) and what the business owes (creditors)
- raise GST sales invoices and record purchase bills
- take receipts and make payments, applied against specific bills
- issue credit notes and debit notes for returns
- see who is overdue, by how many days, and how much
- prove the books balance with a trial balance
- print a GST tax invoice and a statement of account

The application runs entirely on the machine. No server, no login to a cloud, no internet needed to bill a customer.

## 2. Who uses it

| Role | What they do | What they need from the product |
|---|---|---|
| Owner | Checks money in, money out, who owes what, whether the month made a profit | A dashboard that answers four questions in five seconds |
| Billing clerk | Creates invoices, takes payments, prints bills | Fast keyboard entry, no accounting jargon, cannot break the books |
| Accountant | Reviews ledgers, passes journals, files GST | Correct double entry, registers, exports |
| Auditor | Reads history, checks cancellation trail | Read-only role, immutable posted vouchers, audit log |

The clerk never sees the words debit and credit. The books still record them.

## 3. Scope of version 1

Version 1 is creditors and debtors done properly. Everything below ships together.

### In scope

1. Company profile: name, legal name, GSTIN, PAN, state code, address, financial year, books begin date, logo, invoice terms.
2. Chart of accounts with seeded groups and reserved system accounts.
3. Parties: one record per business, flagged as customer, supplier, or both. Credit days and credit limit. Opening balance.
4. Items: name, HSN or SAC, unit, GST rate, sale price, purchase price, service flag, optional serial tracking, opening stock.
5. Sales vouchers: credit sale, cash sale, multi line, discount, tax inclusive or exclusive rates, CGST/SGST or IGST by place of supply, round off.
6. Purchase vouchers: same structure, supplier side.
7. Receipts and payments, including bill wise allocation: against a bill, advance, or on account.
8. Credit notes and debit notes as reversing vouchers.
9. Journal and contra vouchers for adjustments and cash to bank transfers.
10. Cancel and reissue. Posted vouchers are never edited.
11. Reports: receivables, payables, ageing, party statement, day book, ledger, trial balance, sales register, purchase register, profit and loss, balance sheet.
12. Print and PDF: GST tax invoice, purchase bill view, statement of account.
13. Excel export for every register and report.
14. Roles and permissions: owner, accountant, billing clerk, auditor.
15. Backup and restore of the database file.

### Out of scope for version 1

| Deferred to | Item |
|---|---|
| Phase 5 | Stock summary, stock journal, physical count, NRV write down, serial number register |
| Phase 6 | GSTR-1 and GSTR-3B working papers, HSN summary, e-invoice JSON |
| Phase 7 | Bank reconciliation, cheque printing, CSV bank import |
| Phase 8 | Payment reminders, recurring invoices, attachments, multi-company switcher |
| Phase 9 | Quotations, sales orders, delivery challans, purchase orders, payroll, TDS/TCS, cost centres, budgets, multi currency |

Note on inventory: version 1 still writes stock movements and posts cost of goods sold for goods items. Only the stock reports are deferred. This is a deliberate choice so phase 5 adds reports, not a rewrite.

## 4. The one sentence that decides arguments

Every screen must answer one of three questions: what do I owe, what is owed to me, or does the books balance.

If a feature does not serve one of those, it is phase 9 or it is not built.

## 5. Success measures

| Measure | Target | How we check |
|---|---|---|
| Post a GST bill and match the printed total | Exact to the paisa | Golden fixtures built from `sales-bill.pdf` and `purchase-bill.pdf` |
| Trial balance always balances | 100% of generated books | Property test over random voucher sets |
| Time to create a five line invoice | Under 90 seconds, keyboard only | Timed usability run with a clerk |
| Find who is overdue | Under 5 seconds from login | Dashboard and ageing report |
| Books survive a crash mid post | Zero half posted vouchers | One transaction per voucher, tested rollback |
| Reconstruct any balance | From rows only, never from a stored total | No stored balance columns except opening balances |

## 6. Non-goals

Crown Books is not a CRM. It does not run a sales pipeline, campaigns, follow ups or memberships. Those modules from the previous project are deleted, not hidden.

Crown Books is not a cloud product in version 1. Bank feeds, e-invoicing and WhatsApp reminders need connectivity and are treated as later integrations.

Crown Books is not a payroll system. Salary journals can be passed manually; payroll computation is phase 9.

## 7. Language we use

The product speaks the language of the shop, not the language of accounting textbooks. Internally the domain model uses the standard terms so that reports and exports are defensible.

| What the clerk calls it | What the system calls it |
|---|---|
| Bill, invoice | Sales voucher |
| Purchase bill | Purchase voucher |
| Payment received | Receipt voucher |
| Payment made | Payment voucher |
| Return to us | Credit note |
| Return to supplier | Debit note |
| Party | Party (customer, supplier, or both) |
| Due | Outstanding, with ageing |
| Day book | Day book |

See `01-domain-model.md` for the full vocabulary.
