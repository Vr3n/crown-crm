# Refactor inventory

Status: design, pre-implementation
Purpose: the exact change list for P0 and P1. If a file is not listed here, it is unchanged.

## 1. Baseline

| Measure | Value |
|---|---|
| Source files under `src` | 418 |
| Source lines | 58,327 |
| Renderer lines | 37,832 |
| Main process lines | 17,599 |
| Shared contract lines | 2,076 |
| Feature folders | 15 |
| Feature lines | 31,846 |
| Schema tables | 38 |
| IPC channels | 122 |
| Migrations | 29 |
| Test files | 84 |

Roughly 91 percent of renderer feature code belongs to the gym domain or must be rebuilt for accounting. This is not a refactor of screens. It is a replacement of the domain with the plumbing kept.

## 2. Keep unchanged

| Path | Why |
|---|---|
| `src/main/db/connection.ts` | `node:sqlite`, Drizzle binding, savepoint aware `withTransaction` |
| `src/main/db/migrations.ts` | Runner and `?raw` bundling |
| `src/main/db/permissions.ts` | Structure is right, contents change |
| `src/main/db/idempotency` usage | Already correct |
| `src/main/ipc/handle.ts` | Zod boundary, result envelope, error mapping |
| `src/main/domain/errors.ts` | Domain error base |
| `src/main/domain/dates.ts` | Date helpers |
| `src/main/domain/phone.ts` | Phone normalisation |
| `src/main/auth/*` | Password hashing and sessions |
| `src/main/licensing/*` | Install lock, fingerprint |
| `src/main/lib/logger.ts` | Logging |
| `src/main/pdf/renderer.ts` | PDF engine, templates replaced |
| `src/main/application/export.ts` | Excel writer, report writers added |
| `src/main/application/identity.ts` | Session restore, setup, login |
| `src/main/ipc/identity.ts`, `identity-read.ts`, `handle.ts` | Access control |
| `src/renderer/src/components/ui/*` | shadcn primitives, restyled by tokens |
| `src/renderer/src/context/session-context.tsx` | Session and permission checks |
| `src/renderer/src/layouts/AppLayout.tsx` | Shell, sidebar slot changes |
| `src/renderer/src/lib/money.ts`, `format.ts`, `validation.ts` | Formatting and money helpers |
| `src/renderer/src/lib/use-debounced-value.ts`, `use-now.ts` | Generic hooks |
| `tests/setup`, DB helpers, Playwright config | Test infrastructure |
| `vitest.config.ts`, `playwright.config.ts`, `drizzle.config.ts` | Build and test config |

## 3. Delete

### Renderer features

| Path | Lines | Reason |
|---|---|---|
| `features/leads/**` | 6,243 | Sales pipeline, no equivalent in books |
| `features/followups/**` | 1,383 | Lead follow ups |
| `features/activities/**` | 414 | Lead activities |
| `features/catalog/**` | 3,056 | Plans, offers, policies |
| `features/memberships/**` | 3,231 | Membership sale, renew, cancel |
| `features/refunds/**` (inside finance) | part of 4,220 | Refunds are credit notes |
| `features/collections/**` | 806 | Gym daily collection |
| `features/people/**` | 372 | Blacklist banner and dialogs |
| `features/dashboard/**` | 3,474 | Rebuilt as an accounting dashboard |
| `features/customers/**` | 2,375 | Replaced by parties |
| `features/invoices/**` | 3,495 | Replaced by vouchers |
| `components/person/**` | n/a | Photo, webcam, avatar for members |

Kept and rebuilt in place: `features/finance/**` becomes receipts and payments, `features/identity/**` stays with copy changes.

### Main process

| Path | Reason |
|---|---|
| `application/leads.ts` | Pipeline |
| `application/memberships.ts` | Membership lifecycle |
| `application/catalog.ts` | Plans and offers |
| `application/billing.ts` | Invoice draft and finalise, replaced by vouchers |
| `application/finance.ts` | Payments, refunds, credits, replaced |
| `application/blacklist.ts` | Member blacklist |
| `application/person-photo.ts` | Member photo |
| `application/organization-logo.ts` | Replaced by company logo, rewritten |
| `domain/lead.ts`, `domain/membership.ts`, `domain/catalog.ts`, `domain/billing.ts`, `domain/pricing.ts`, `domain/finance.ts` | Gym and old finance rules |
| `repositories/leads` (in `identity.ts` / `sales.ts`), `sales.ts`, `membership.ts`, `catalog.ts`, `billing.ts`, `finance.ts` | Replaced |
| `ipc/sales.ts`, `catalog.ts`, `billing.ts`, `finance.ts`, `customers.ts`, `invoices.ts`, `memberships.ts`, `dashboard.ts`, `collections.ts`, `blacklist.ts`, `person.ts`, `pdf.ts` (rewritten) | Replaced |
| `db/schema/sales.ts`, `catalog.ts`, `membership.ts`, `billing.ts`, `finance.ts` | Replaced |
| `pdf/templates/invoice-document.ts`, `payment-receipt.ts`, `refund-receipt.ts`, `shared.ts` | Replaced by tax invoice, statement, receipt |
| `db/seed.ts` gym seeds | Replaced by accounting seeds |

### Shared contracts

`contracts/sales.ts`, `catalog.ts`, `membership-sale.ts`, `membership-cancel-renew.ts`, `customers.ts`, `invoices.ts`, `billing.ts`, `finance.ts`, `dashboard.ts`, `collections.ts`, `blacklist.ts`, `person-photo.ts`, `money.ts` (kept, audited), `license.ts` (kept).

### Tests

45 gym test files across `tests/main`, `tests/renderer`, `tests/e2e`. Removed with their modules. The infrastructure and the identity, licensing, migration and money tests stay.

## 4. Rebuild or rename

| Current | Becomes | Notes |
|---|---|---|
| `organizations` table | `companies` | Add GSTIN, PAN, state code, FY, costing, rounding |
| `organization_id` column | `company_id` | Every table |
| `organization_staff` | `company_users` | Same shape |
| `people` + `customers` | `parties` + `party_accounts` | One row per business |
| `invoices` + `invoice_lines` | `vouchers` + `voucher_item_lines` | One voucher table for all types |
| `payments` | `vouchers` type RECEIPT or PAYMENT | Money in and out |
| `payment_allocations` | `bill_allocations` | Adds allocation type |
| `refunds` | `CREDIT_NOTE` voucher | No separate object |
| `credits` | Advance or on account allocation | No stored remaining balance |
| `membership_plans` | `items` with `is_service` | A plan is a service item |
| `offers` | Price on the item, or a discount on the line | No offer engine |
| `payment_methods` | Same table, new seed | Kept |
| `idempotency` | Same table | Kept |
| `features/finance` | `features/receipts`, `features/payments` | Split by direction |
| `features/identity` | `features/company`, `features/users` | Split by concern |
| `lib/navigation.tsx` | New groups | See design system |

## 5. New modules

### Main

```
src/main/db/schema/accounting.ts        companies, accounts, groups, parties
src/main/db/schema/masters.ts           items, units, stock groups, godowns, tax rates
src/main/db/schema/documents.ts         vouchers, lines, ledger, stock, allocations
src/main/db/schema/operations.ts        audit, sequences, payment methods

src/main/domain/money.ts                integer paise arithmetic, round half up
src/main/domain/tax.ts                  line tax, place of supply, totals
src/main/domain/numbering.ts            series and FY labels
src/main/domain/posting/index.ts        dispatcher
src/main/domain/posting/sales.ts
src/main/domain/posting/purchase.ts
src/main/domain/posting/receipt.ts
src/main/domain/posting/payment.ts
src/main/domain/posting/credit-note.ts
src/main/domain/posting/debit-note.ts
src/main/domain/posting/journal.ts
src/main/domain/posting/contra.ts
src/main/domain/posting/opening.ts
src/main/domain/outstanding.ts          bill outstanding and ageing maths
src/main/domain/allocation.ts           allocation guards

src/main/repositories/accounts.ts
src/main/repositories/parties.ts
src/main/repositories/items.ts
src/main/repositories/vouchers.ts
src/main/repositories/reports.ts
src/main/repositories/audit.ts

src/main/application/company.ts
src/main/application/accounts.ts
src/main/application/parties.ts
src/main/application/items.ts
src/main/application/vouchers.ts
src/main/application/receipts.ts
src/main/application/payments.ts
src/main/application/reports.ts
src/main/application/backup.ts

src/main/ipc/company.ts
src/main/ipc/accounts.ts
src/main/ipc/parties.ts
src/main/ipc/items.ts
src/main/ipc/vouchers.ts
src/main/ipc/reports.ts
src/main/ipc/backup.ts

src/main/pdf/templates/tax-invoice.ts
src/main/pdf/templates/statement.ts
src/main/pdf/templates/receipt.ts
src/main/pdf/templates/ageing.ts
```

### Shared

```
src/shared/contracts/company.ts
src/shared/contracts/accounts.ts
src/shared/contracts/parties.ts
src/shared/contracts/items.ts
src/shared/contracts/vouchers.ts
src/shared/contracts/receipts.ts
src/shared/contracts/reports.ts
src/shared/contracts/tax.ts
```

### Renderer

```
features/dashboard/          money in, money out, receivables, payables
features/parties/            list, detail, statement, form
features/items/              list, detail, form
features/sales/              list, entry, detail, print
features/purchases/          list, entry, detail
features/receipts/           list, entry with allocation
features/payments/           list, entry with allocation
features/notes/              credit and debit note entry
features/journals/           journal and contra entry
features/day-book/
features/reports/            receivables, payables, ageing, ledger, trial balance, P&L, BS, registers
features/accounts/           chart of accounts
features/masters/            units, tax rates, series, godowns
features/company/            profile, financial year, branding
features/users/              staff and roles
features/backup/
```

## 6. IPC channel delta

### Removed (about 100 channels)

All `leads:*`, `catalog:*`, `billing:*`, `memberships:*`, `membership:*`, `customers:*`, `invoices:*`, `collections:*`, `dashboard:*`, `refund:*`, `credit:*`, `person:*`, `blacklist`, and the gym specific `finance:*` read models.

### Added

```
company:get, company:update, company:setFinancialYear
accounts:list, accounts:tree, accounts:create, accounts:update, accounts:deactivate
parties:list, parties:get, parties:create, parties:update, parties:deactivate
parties:statement, parties:outstanding
items:list, items:get, items:create, items:update, items:deactivate
items:stockSummary
vouchers:createDraft, vouchers:post, vouchers:cancel, vouchers:get, vouchers:list
vouchers:nextNumber, vouchers:preview
receipts:post, receipts:outstandingBills
payments:post, payments:outstandingBills
notes:postCreditNote, postDebitNote
journals:post
reports:dayBook, reports:ledger, reports:trialBalance, reports:profitAndLoss,
reports:balanceSheet, reports:receivables, reports:payables, reports:ageing,
reports:salesRegister, reports:purchaseRegister, reports:integrity
backup:create, backup:list, backup:restore
```

Naming follows the existing `domain:verb` convention.

## 7. Permission catalog delta

Removed: `lead.*`, `followup.*`, `plan.*`, `offer.*`, `membership.*`, `invoice.*` (replaced), `refund.*`, `credit.*`, `person.blacklist`.

Added:

```
party.view, party.create, party.edit, party.deactivate
item.view, item.create, item.edit, item.deactivate
voucher.view, voucher.create, voucher.post, voucher.cancel
receipt.view, receipt.record
payment.view, payment.record
note.view, note.create
journal.view, journal.create
report.view, report.export
company.view, company.manage
backup.manage
```

Kept: `user.*`, `role.*`, `org.*` renamed to `company.*`, `settings.manage`.

Seeded roles:

| Role | Grants |
|---|---|
| Owner | Super |
| Accountant | Everything except user management and company deletion |
| Billing Clerk | Party view and create, voucher create and post for sales and receipts, report view |
| Auditor | View everything, write nothing |

## 8. Dependency delta

Remove: nothing required by the current design. `@yornaath/batshit` is used by the old dashboard search; confirm before removing.

Add: nothing. The current stack already has Drizzle, Zod, TanStack Query, TanStack Form, TanStack Table, exceljs, Radix and Tailwind. Accounting needs arithmetic and patience, not new libraries.

Keep an eye on: `date-fns` for Indian financial year helpers, already installed.

## 9. Copy and metadata changes

| File | Change |
|---|---|
| `package.json` | name, description, product name, version reset to 0.1.0 |
| `electron-builder.yml` | appId, productName, installer name |
| `src/main/index.ts` | database filename, log prefix, window title |
| `README.md` | rewritten for Crown Books |
| `AGENTS.md` | rewritten, points at the new docs |
| `src/renderer/index.html` | title |
| `build/icon.*` | new mark, phase 0 |

## 10. Verification checklist for P0

```
grep -ri "gym\|membership\|trainer\|lead\|followup\|blacklist" src   -> zero hits
grep -ri "organization_id" src                                       -> zero hits
npm run typecheck && npm run lint && npm test                        -> green
sqlite3 crown-books.db ".tables"                                     -> exactly the 25 tables
node -e "seed integrity check"                                       -> trial balance zero
```
