# Phase 0 report: foundation

Branch: `phase-0-foundation`
Status: complete, merged to `master`
Date: 21 October 2026

## 1. Objective

Turn the gym CRM into the Crown Books foundation: no gym domain, a new accounting schema, a working first-run setup, and the shell every later phase plugs into. No accounting screen is implemented yet, by design.

## 2. What was removed

| Area | Removed |
|---|---|
| Renderer | Leads, follow-ups, activities, catalog (plans, offers, policies), memberships and the sale wizard, collections, customers, invoices, finance pages, refunds, credits, blacklist, member photos, gym dashboard, identity settings UI |
| Main | Lead, membership, catalog, billing, finance, blacklist, photo storage and gym dashboard application code, repositories, domain rules, IPC handlers |
| Schema | 38 gym tables including leads, people, memberships, plans, offers, invoices, payments, allocations, refunds and credits |
| Contracts | Sales, catalog, billing, finance, customers, invoices, dashboard, collections, membership, person photo |
| Tests | 45 gym test files, including the whole Electron e2e suite |
| Migrations | All 29 gym migrations, replaced by one baseline |

The old database file (`CrownCRM.db`) is not opened. Crown Books uses `crown-books.db`, so the previous installation stays intact on disk.

## 3. What was built

### 3.1 Schema: 25 tables

`src/main/db/schema/`

| File | Tables |
|---|---|
| `identity.ts` | companies, users, roles, permissions, role_permissions, company_users, app_meta |
| `accounting.ts` | account_groups, accounts, parties, party_accounts, units, stock_groups, godowns, items, tax_rates |
| `documents.ts` | voucher_sequences, vouchers, voucher_item_lines, ledger_lines, stock_movements, bill_allocations |
| `operations.ts` | payment_methods, audit_events |
| `idempotency.ts` | idempotency_keys |

The shape follows `docs/02-database-schema.md`. Money is integer paise, quantity is scaled by 10,000, percentages are basis points. Ledger lines enforce one side only and non negative amounts in SQL. Stock movements enforce one direction per row. Voucher numbers are unique per company, type, series and financial year.

`src/main/db/migrations/20261021000000_accounting_core/migration.sql` is the single baseline. The runner in `migrations.ts` was simplified accordingly: version 0, no legacy reconciliation, still atomic.

### 3.2 Seed data

`src/main/db/seed.ts`, run inside the setup transaction:

- 5 roles: Owner, Admin, Accountant, Billing Clerk, Auditor
- 19 account groups across the five natures
- 19 accounts, including every reserved system key the posting engine will use (`SALES`, `OUTPUT_CGST`, `INPUT_SGST`, `ROUND_OFF`, `COGS`, `INVENTORY`, `OPENING_DIFF` and the rest)
- 11 units, 5 GST rates, 7 payment methods, one godown, one stock group
- Party ledger accounts are created per party in Phase 1, not seeded

The seed is idempotent and tested.

### 3.3 Company and identity

`organizations` became `companies`, `organization_id` became `company_id` across the surviving code and schema. The setup flow now captures what the books need: business name, owner, state code, optional GSTIN and phone, and the books begin date.

`setupCompany` creates the company, seeds roles and defaults, creates the owner and membership, and starts the session, all in one transaction. Login, remembered sessions, staff creation and company updates are preserved and tested.

Logo upload is deferred to Phase 1; the old photo storage module was deleted.

### 3.4 Application shell

`src/renderer/src`

- `components/auth/AuthGate.tsx` is rewritten as a split setup and login screen using the Ledger Paper system.
- `components/layout/Sidebar.tsx`, `Topbar.tsx`, `layouts/AppLayout.tsx` implement the grouped navigation from the design system.
- `lib/navigation.tsx` defines Home, Books, Parties, Items, Reports, Masters and Admin, each item tagged with the phase that delivers it.
- `features/dashboard/pages/DashboardPage.tsx` shows receivables, payables, cash and bank, voucher count, a setup checklist and an empty recent vouchers panel.
- Every other route renders `ModulePlaceholder`, which states the phase and what the screen will do. There are no fake screens.
- Theme tokens in `assets/main.css` implement Ledger Paper: warm paper, ink, hairline rules, ink blue accent, 2px corners, IBM Plex Sans and Mono.

Research notes from real TallyPrime screens and Intuit documentation are recorded in `docs/06-design-system.md`, section 12, and drive the shell and the future voucher page.

### 3.5 IPC surface

The channel list is reduced from 122 to 13:

```
identity:setup, login, session, status, createStaff, checkCompanyExists,
logout, company, staff, roles, updateCompany
dashboard:summary
license:status
```

`dashboard:summary` computes receivables, payables, cash and bank from ledger and allocation rows, so it becomes meaningful the moment Phase 2 starts posting.

## 4. Tests

167 tests pass across 16 files.

| Area | Coverage |
|---|---|
| Migrations | all 25 tables exist, no gym tables, baseline recorded once, idempotent, ledger one-side check, stock one-direction check, duplicate voucher number refused |
| Seed | 19 groups, system account keys, units, GST rates in basis points, payment methods, godown, role set, idempotency |
| Identity | setup creates company and owner, second setup refused, bad state and GSTIN rejected, status transitions, login and wrong password, staff creation, permission enforcement, company updates |
| Repositories | company create/read/update/count, owner detection case-insensitively, roles and super permissions, staff membership resolution and disablement |
| Domain | integer money rounding at the half, GST basis point math against the 15,545 bill, quantity scaling, financial year boundaries including a January start |
| Contracts | setup defaults, state code validation, update schema enums, Indian money formatting |
| Existing | password hashing, sessions, IPC envelope, licensing |

Commands run:

```
npm run typecheck   # node and web, both clean
npx eslint src tests
npx vitest run      # 167 passed
npm run build       # main, preload and renderer bundles built
```

## 5. Decisions taken during the phase

1. **One baseline migration.** The product starts on a new file, so the gym migration chain was deleted rather than extended. The docs said version 32; a clean version 0 is simpler and the old database is never opened.
2. **Company rename is total.** No `organization` identifier remains in `src` or `tests`. A grep is part of the phase check.
3. **Logo and brand assets deferred.** Setup no longer accepts a logo. File storage returns with the company settings screen in Phase 1.
4. **Search is a stub.** The top bar search explains that it arrives with the first vouchers instead of pretending to search.
5. **Placeholders are explicit.** Every unbuilt route names its phase, so the shell is honest rather than empty.
6. **Seed data runs at setup, not in the migration,** because accounts and roles are company scoped and need the company id.

## 6. Known gaps and Phase 1 entry points

- Company settings screen, chart of accounts screen, parties and items CRUD are Phase 1.
- Party ledger accounts do not exist until a party is created; the repository helper lands with Phase 1.
- No voucher numbering helper yet; Phase 2 adds `allocateNumber` using `voucher_sequences`.
- No PDF templates. The renderer and types were kept, templates were removed with the gym invoices.
- The Electron end-to-end suite was deleted with the gym flows. Phase 1 adds a setup smoke test and Phase 3 the first business script.
- Bundle size is 1.35 MB uncompressed; code splitting is a Phase 8 concern.

## 7. File map for the phase

```
src/main/db/schema/identity.ts        tenancy and access
src/main/db/schema/accounting.ts      masters
src/main/db/schema/documents.ts       vouchers, ledger, stock, allocations
src/main/db/schema/operations.ts      payment methods, audit
src/main/db/migrations/...            baseline SQL
src/main/db/migrations.ts             runner
src/main/db/seed.ts                   roles, chart of accounts, reference data
src/main/db/permissions.ts            permission catalog
src/main/domain/money.ts              integer arithmetic
src/main/domain/fy.ts                 financial year labels and bounds
src/main/application/identity.ts      setup, login, staff, company updates
src/main/repositories/identity.ts     companies, users, roles, staff, app meta
src/main/ipc/identity.ts              identity commands
src/main/ipc/identity-read.ts         company, staff and role reads
src/main/ipc/dashboard.ts             summary query
src/shared/contracts/identity.ts      session, setup and update contracts
src/shared/contracts/ipc.channels.ts  channel catalog
src/preload/index.ts                  typed bridge
src/renderer/src/assets/main.css      Ledger Paper tokens
src/renderer/src/components/auth/     setup and login
src/renderer/src/components/layout/   rail and top bar
src/renderer/src/features/dashboard/  books dashboard
src/renderer/src/lib/navigation.tsx   grouped navigation
src/renderer/src/AppRoutes.tsx        routes and phase placeholders
```
