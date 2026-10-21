# Database schema

Status: design, pre-implementation
Engine: SQLite through `node:sqlite`, queried with Drizzle
Money: integer paise, suffix `_minor`
Quantity: integer scaled by 10,000, suffix `_e4`
Percentages: integer basis points, suffix `_bps`

## 1. Shape of the change

The current database has 38 tables across identity, sales pipeline, catalog, membership, billing and finance. The new database has 25. Nothing from the gym domain survives.

What happens to the existing database:

1. The app writes a new file, `crown-books.db`, in the same user data folder. The old `CrownCRM.db` is left untouched on disk.
2. Migration 32 creates the new schema from scratch, seeded with the chart of accounts, units, GST rates and roles.
3. Users, roles and permissions are recreated by the setup screen. There is no data migration, by decision: the gym books and the accounting books are different products.

This keeps the change honest and reversible. If the accounting app is abandoned, the old file and the old build still exist.

## 2. Table map

| Group | Tables |
|---|---|
| Tenancy and access | `companies`, `users`, `roles`, `permissions`, `role_permissions`, `company_users` |
| Masters | `account_groups`, `accounts`, `parties`, `units`, `stock_groups`, `godowns`, `items`, `tax_rates` |
| Documents | `voucher_sequences`, `vouchers`, `voucher_item_lines`, `ledger_lines`, `stock_movements`, `bill_allocations` |
| Operations | `payment_methods`, `idempotency`, `audit_events` |
| System | `app_meta` |

## 3. Tenancy and access

### companies

```
id                    integer pk
slug                  text unique not null
name                  text not null
legal_name            text
gstin                 text
pan                   text
state_code            text not null            -- '27' for Maharashtra
address               text
city                  text
pincode               text
phone                 text
email                 text
currency              text not null default 'INR'
fy_start_month        integer not null default 4
books_begin_date      text not null
logo                  text
invoice_terms         text
invoice_prefix        text
costing_method        text not null default 'WEIGHTED_AVERAGE'  -- or FIFO
round_off_mode        text not null default 'INVOICE'          -- or LINE, NONE
allow_negative_stock  integer not null default 1
status                text not null default 'ACTIVE'
created_at            text not null default (datetime('now'))
```

Note: this replaces `organizations`. Column names stay close so the identity module changes by rename, not rewrite.

### users, roles, permissions, role_permissions, company_users

Unchanged in structure from the current project. `organization_id` becomes `company_id`, `organization_staff` becomes `company_users`. The permission catalog is replaced (see `08-refactor-inventory.md`).

### app_meta

Key value store for schema version, last backup time, first run flag.

## 4. Masters

### account_groups

```
id, company_id, name, parent_id (nullable, self reference),
nature            -- ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
sort_order, is_system
unique (company_id, name)
```

Seeded groups: Capital Account, Loans, Current Liabilities, Sundry Creditors, Current Assets, Cash in Hand, Bank Accounts, Sundry Debtors, Stock in Hand, Fixed Assets, Sales, Sales Returns, Purchases, Purchase Returns, Direct Expenses, Indirect Expenses, Direct Incomes, Indirect Incomes, Duties and Taxes.

### accounts

```
id, company_id, group_id
name, code
type              -- ASSET | LIABILITY | EQUITY | INCOME | EXPENSE
system_key        -- nullable, unique per company when set
is_system, is_active
opening_balance_minor, opening_balance_side  -- DEBIT | CREDIT
created_at
unique (company_id, name)
unique (company_id, system_key) where system_key is not null
index (company_id, type)
```

Reserved keys: SALES, SALES_RETURNS, PURCHASES, PURCHASE_RETURNS, OUTPUT_CGST, OUTPUT_SGST, OUTPUT_IGST, INPUT_CGST, INPUT_SGST, INPUT_IGST, ROUND_OFF, COGS, INVENTORY, STOCK_ADJUSTMENT, DEBTORS_CONTROL, CREDITORS_CONTROL, CASH, BANK, OPENING_DIFF, DISCOUNT_GIVEN, DISCOUNT_RECEIVED.

A parent account (one with children) cannot receive ledger lines. Enforced in the domain layer and checked in the integrity report.

### parties

```
id, company_id
name, display_name
phone, email
gstin, pan
state_code
billing_address, shipping_address
is_customer, is_supplier
credit_days            integer default 0
credit_limit_minor     integer default 0
opening_balance_minor  integer default 0
opening_balance_date   text
ledger_account_id      integer not null references accounts(id)
is_active, notes
created_at, updated_at
unique (company_id, phone) where phone is not null
index (company_id, is_customer, is_active)
index (company_id, name)
```

A party needs up to two ledger accounts, because the balance sheet shows debtors and creditors separately and one shop can be both. The link lives in `party_accounts`:

### party_accounts

```
id, company_id, party_id, account_id, role  -- DEBTOR | CREDITOR
unique (company_id, party_id, role)
```

A payment or receipt posts to the account matching its role. Outstanding reports use the role. This also lets the party appear in both ageing reports with different balances, which is what Tally does.

### units

```
id, company_id, name, symbol, decimals, is_system
unique (company_id, name)
```

Seeded: Nos, Pcs, Kg, Gm, Ltr, Ml, Mtr, Box, Pack, Set, Hr.

### stock_groups

```
id, company_id, name, parent_id, is_active
```

### godowns

```
id, company_id, name, address, is_active
```

One default godown is seeded: Main Location.

### items

```
id, company_id
name, sku
hsn_sac
uom_id
stock_group_id
gst_rate_bps, cess_rate_bps
is_service
track_serial
sale_price_minor, purchase_price_minor
opening_qty_e4, opening_rate_minor
reorder_level_e4
is_active, notes
created_at, updated_at
unique (company_id, sku) where sku is not null
index (company_id, name)
index (company_id, hsn_sac)
```

### tax_rates

```
id, company_id
gst_rate_bps, cess_rate_bps
description
effective_from, effective_to (nullable)
```

Seeded: 0, 5, 12, 18, 28 percent with no end date. A rate change is a new row plus an end date on the old one. Bills keep their snapshot, so history never changes.

## 5. Documents

### voucher_sequences

```
id, company_id
voucher_type          -- SALES | PURCHASE | RECEIPT | ...
series                -- 'A', 'TC', 'INV'
fy                    -- '2026-27'
prefix
suffix
last_value            integer not null default 0
padding               integer not null default 4
unique (company_id, voucher_type, series, fy)
```

Number format: `prefix + padded(last_value + 1) + suffix`. Example: `TC/` + `0583` gives `TC/0583`.

### vouchers

```
id, company_id
voucher_type          -- see domain model table
series
number                text not null
fy
voucher_date          text not null          -- ISO date
due_date              text
party_id              integer references parties(id)
place_of_supply_state_code text
narration
reference_no
status                -- DRAFT | POSTED | CANCELLED

taxable_minor, cgst_minor, sgst_minor, igst_minor, cess_minor
discount_minor, round_off_minor, total_minor, total_qty_e4

payment_method_id, instrument_no, instrument_date, bank_account_id
reversal_of_voucher_id  integer references vouchers(id)
cancelled_at, cancelled_by, cancel_reason

idempotency_key
created_at, created_by
posted_at, posted_by
unique (company_id, voucher_type, series, fy, number)
index (company_id, voucher_date)
index (company_id, voucher_type, status)
index (company_id, party_id, voucher_date)
index (company_id, due_date) where status = 'POSTED'
```

Draft vouchers are allowed only on screens that support them. A draft writes no ledger lines, no stock movements and no allocations.

### voucher_item_lines

```
id, company_id, voucher_id
item_id                integer references items(id)   -- nullable for free text
description_snapshot, hsn_snapshot, uom_snapshot
qty_e4                 integer not null
entered_rate_minor     integer not null
rate_includes_tax      integer not null default 0
discount_bps           integer not null default 0
taxable_value_minor, cgst_minor, sgst_minor, igst_minor, cess_minor
line_total_minor
unit_cost_minor        integer                   -- cost of goods issued, null for services
godown_id
sort_order
index (voucher_id)
```

### ledger_lines

```
id, company_id, voucher_id
account_id             integer not null references accounts(id)
party_id               integer references parties(id)
debit_minor            integer not null default 0
credit_minor           integer not null default 0
narration
sort_order
check (debit_minor >= 0 and credit_minor >= 0)
check ((debit_minor = 0) <> (credit_minor = 0))
index (company_id, account_id)
index (voucher_id)
index (company_id, party_id)
```

A row with both sides zero is invalid. A row with both sides set is invalid. The pair check is the cheapest data quality guard in the system.

### stock_movements

```
id, company_id, voucher_id
item_id, godown_id
qty_in_e4              integer not null default 0
qty_out_e4             integer not null default 0
unit_cost_minor        integer not null default 0
movement_type          -- OPENING | PURCHASE | SALE | RETURN_IN | RETURN_OUT |
                       -- ADJUSTMENT | TRANSFER_IN | TRANSFER_OUT | WRITE_DOWN
created_at
check (qty_in_e4 >= 0 and qty_out_e4 >= 0)
check ((qty_in_e4 = 0) <> (qty_out_e4 = 0))
index (company_id, item_id, godown_id)
index (voucher_id)
```

Stock on hand is `SUM(qty_in_e4 - qty_out_e4)`. There is no quantity column anywhere.

### bill_allocations

```
id, company_id
from_voucher_id        integer not null references vouchers(id)   -- receipt or payment
to_voucher_id          integer not null references vouchers(id)   -- bill or note
amount_minor           integer not null
allocation_type        -- AGAINST_REF | ADVANCE | ON_ACCOUNT | OPENING
created_at, created_by
check (amount_minor > 0)
index (from_voucher_id)
index (to_voucher_id)
index (company_id)
```

## 6. Operations

### audit_events

```
id, company_id
entity                 -- VOUCHER | PARTY | ITEM | ACCOUNT | SETTINGS | USER
entity_id
action                 -- CREATE | POST | CANCEL | UPDATE | DEACTIVATE | RESTORE
before_json, after_json
actor_user_id
created_at
index (company_id, entity, entity_id)
index (company_id, created_at)
```

### idempotency

Kept from the current project, keyed by company and channel. A repeated post with the same key returns the original voucher instead of writing a second one.

### payment_methods

Kept, re-seeded with Cash, UPI, Card, Bank Transfer, Cheque, NEFT, RTGS.

## 7. Integrity checks

These run as a report and in tests. They are not triggers, because a multi row invariant cannot be enforced by a row level constraint in SQLite, and a trigger that fires per row would reject valid intermediate states.

| Check | Query shape | Failure meaning |
|---|---|---|
| Voucher balances | `SUM(debit) <> SUM(credit)` grouped by voucher | A posting bug or a manual write |
| Orphan ledger line | ledger line with no voucher or no account | Corrupt write |
| Allocation over bill | grouped allocation sum greater than bill total | Guard bypassed |
| Allocation over payment | grouped allocation sum greater than payment total | Guard bypassed |
| Stock ledger mismatch | inventory account balance versus `SUM(qty * cost)` | Costing bug |
| Negative stock | on hand below zero while policy forbids it | Should have warned |
| Duplicate number | same type, series, fy, number | Sequence bug |
| Account type missing | account with null or unknown type | Seed or edit bug |

The trial balance is the user facing version of check one.

## 8. Migration plan

| Version | Name | Content |
|---|---|---|
| 32 | `accounting_core` | Drop gym tables, rename tenancy to company, create masters and document tables, seed groups, accounts, units, tax rates, payment methods |
| 33 | `accounting_indexes` | Reporting indexes measured on 50k vouchers |
| 34 | `accounting_seed_roles` | Owner, Accountant, Billing Clerk, Auditor with the new permission codes |
| 35 | `accounting_opening` | Opening voucher helper structures if needed |

Rules for new migrations, carried over from the current project:

1. Migrations are append only and never edited after shipping.
2. Each migration is idempotent where SQLite allows it.
3. Version numbers 1 and 2 stay reserved for the legacy runner.
4. Every migration is exercised in `tests/main/migrations.test.ts` against an empty database and against a database one version behind.

## 9. Size expectations

A small trader writes 300 to 1,500 vouchers a month, 3 to 8 lines each. At 5 years that is roughly 90,000 vouchers, 400,000 item lines and 800,000 ledger lines.

SQLite handles this comfortably with the indexes above. The reports that matter are:

- party outstanding: index on `(company_id, party_id, voucher_date)` plus allocation lookup
- ageing: index on `(company_id, due_date)` filtered to posted
- day book: index on `(company_id, voucher_date)`

No report needs a materialised total. If one becomes slow, the fix is an index or a covering query, not a stored balance.
