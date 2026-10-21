# Domain model

Status: approved direction
Read with: `02-database-schema.md`, `03-voucher-posting-rules.md`

## 1. Vocabulary

One word, one meaning. If a code path uses a synonym, it is wrong.

| Term | Meaning | Not to be confused with |
|---|---|---|
| Company | The legal books. Holds GSTIN, state, financial year. One active company in v1. | Organisation, tenant, account |
| Account | A line in the chart of accounts. Has a type and a normal balance side. | Party |
| Account group | A category above accounts, for example Sundry Debtors. Grouping only, never posted to. | Account |
| Party | A person or business we deal with. One row, flagged customer and or supplier. | Account, person, contact |
| Item | A thing we sell or buy. Goods or service. Carries HSN, unit and GST rate. | Product, SKU, stock |
| Voucher | One business document. Sale, purchase, receipt, payment, note, journal, contra. | Invoice, transaction, entry |
| Voucher line | One item row inside a voucher. Carries quantity, rate, discount, tax. | Ledger line |
| Ledger line | One debit or credit row inside a voucher. Carries an account and one amount. | Voucher line |
| Stock movement | One quantity in or out for an item. Append only. | Stock balance |
| Bill allocation | A link between a receipt or payment and a bill it settles. | Payment |
| Outstanding | A bill total minus the allocations against it, minus credit notes. Computed, never stored. | Balance, due |
| Ageing | Outstanding bucketed by how long it has been open. | Overdue |
| Posting | The act of writing ledger lines and stock movements for a voucher, once, in one transaction. | Saving, submitting |
| Cancellation | Reversing a posted voucher with mirrored rows and an audit record. | Delete, edit |
| Financial year | The 12 month period that voucher numbers and reports reset on. | Calendar year |

## 2. The entities

```
Company
  ├── Role ── Permission
  ├── CompanyUser ── User
  ├── AccountGroup
  │     └── Account ──── LedgerLine ─┐
  ├── Party ───── LedgerLine ────────┤
  │     └── BillAllocation ──────────┤
  ├── Item ── StockMovement          │
  ├── Voucher ── VoucherLine ────────┘
  │     ├── LedgerLine
  │     ├── StockMovement
  │     └── BillAllocation (as source or target)
  └── VoucherSequence
```

Rules that hold for every entity:

1. Every row carries `company_id`. No exceptions. Reports never cross companies.
2. Every row that a user can create carries `created_by` and `created_at`.
3. Master rows are never deleted once used. They get `is_active = false`.
4. Documents are never deleted once posted. They get `status = CANCELLED` plus a reversing voucher.
5. Money is an integer number of paise. Quantity is an integer scaled by 10,000.
6. Rates and percentages are integers in basis points. 18% is 1800.

## 3. Party

A party is one real business. A shop that buys from us and sells to us is one row with both flags set. The previous project had people, customers and memberships as three concepts; that split is gone.

Fields that matter:

| Field | Why |
|---|---|
| `is_customer`, `is_supplier` | Drives which vouchers the party can appear on. Both may be true. |
| `ledger_account_id` | Every party gets its own account under Sundry Debtors or Sundry Creditors, created in the same transaction as the party |
| `gstin`, `state_code` | Decides CGST/SGST versus IGST on every bill |
| `credit_days`, `credit_limit_minor` | Drives due date and a warning at invoice time |
| `opening_balance_minor`, `opening_balance_date` | Opening position, entered once, posted as an opening voucher |
| `is_active` | Switch off instead of delete |

Party lifecycle:

```
draft?  ->  active  ->  inactive
                |
                +--> blocked for new credit (credit limit exceeded, manual hold)
```

There is no "delete party". A party with no vouchers may be deleted; otherwise it can only be deactivated.

## 4. Account and account group

An account has one of five types. The type fixes the normal balance side, which is what makes the trial balance and balance sheet possible.

| Type | Normal side | Examples |
|---|---|---|
| ASSET | Debit | Cash, Bank, Sundry Debtors, Stock in Hand, Input GST |
| LIABILITY | Credit | Sundry Creditors, Output GST, Loans |
| EQUITY | Credit | Capital, Retained Earnings |
| INCOME | Credit | Sales, Sales Returns (contra), Discount Received |
| EXPENSE | Debit | Purchases, Rent, Salaries, Cost of Goods Sold, Round Off |

Reserved system accounts carry a `system_key`. The posting engine looks these up by key, never by name, so renaming an account in the UI cannot break posting.

```
SALES, SALES_RETURNS, PURCHASES, PURCHASE_RETURNS,
OUTPUT_CGST, OUTPUT_SGST, OUTPUT_IGST, OUTPUT_CESS,
INPUT_CGST, INPUT_SGST, INPUT_IGST, INPUT_CESS,
ROUND_OFF, COGS, INVENTORY, STOCK_ADJUSTMENT,
DEBTORS_CONTROL, CREDITORS_CONTROL, CASH, BANK, OPENING_DIFF,
DISCOUNT_GIVEN, DISCOUNT_RECEIVED
```

An account with children cannot be posted to. This is checked before writing a ledger line.

## 5. Item

An item is either goods or a service.

- Goods items write stock movements on purchase and sale, and post cost of goods sold on sale.
- Service items write no stock movement and no cost of goods sold.
- A line can also be free text with no item link. The snapshot still copies name, HSN and tax rate, so the bill is complete; it just never touches stock.

Item fields that matter: `hsn_sac`, `uom_id`, `gst_rate_bps`, `cess_rate_bps`, `is_service`, `track_serial`, `sale_price_minor`, `purchase_price_minor`, `opening_qty_e4`, `opening_rate_minor`.

## 6. Voucher

One table, many document types. The type decides the posting rule, the screen, the number series and the register. It does not create a new table.

| Type | Clerk name | Writes stock | Requires party | Normal entry |
|---|---|---|---|---|
| SALES | Sales invoice | Out | Yes | Dr Party or Cash, Cr Sales, Cr Output GST |
| PURCHASE | Purchase bill | In | Yes | Dr Purchases or Inventory, Dr Input GST, Cr Party |
| RECEIPT | Payment received | No | Yes | Dr Cash or Bank, Cr Party |
| PAYMENT | Payment made | No | Yes | Dr Party, Cr Cash or Bank |
| CREDIT_NOTE | Sales return | In | Yes | Mirror of sale |
| DEBIT_NOTE | Purchase return | Out | Yes | Mirror of purchase |
| JOURNAL | Adjustment | Optional | No | Free Dr and Cr |
| CONTRA | Cash to bank | No | No | Dr Bank, Cr Cash |
| OPENING | Opening balances | Optional | Optional | Opening position |
| STOCK_JOURNAL | Godown transfer | Transfer | No | Quantity only |
| PHYSICAL_STOCK | Stock count | Adjustment | No | Quantity only |

Status:

```
DRAFT --post--> POSTED --cancel--> CANCELLED
   |                                  ^
   +------------discard---------------+   (draft discard writes no rows)
```

Rules:

1. Only POSTED vouchers touch ledger lines, stock movements or bill allocations.
2. A POSTED voucher is immutable. Every column is frozen except `status` and cancellation metadata.
3. Cancelling writes a mirror voucher with `reversal_of_voucher_id` pointing at the original. Both stay visible in the day book.
4. A cancelled voucher keeps its number. The series never reuses a number.

## 7. Voucher line

The line is a fact, the item is a price list. Every line copies what it needs at entry time:

- `description_snapshot`, `hsn_snapshot`, `uom_snapshot`
- `entered_rate_minor`, `rate_includes_tax`
- `discount_bps`, `gst_rate_bps`
- `taxable_value_minor`, `cgst_minor`, `sgst_minor`, `igst_minor`, `cess_minor`
- `unit_cost_minor` for goods, taken from the stock issue

Changing an item's price or GST rate tomorrow cannot change yesterday's bill. That is the whole point of the snapshot.

## 8. Ledger line

A ledger line has exactly one side filled:

```
CHECK (debit_minor >= 0 AND credit_minor >= 0)
CHECK ((debit_minor = 0) <> (credit_minor = 0))
```

Invariant per voucher, checked before commit:

```
SUM(debit_minor) = SUM(credit_minor)
```

A ledger line may carry `party_id` when the account is a party account. This gives bill wise allocation and party statements without a second structure.

## 9. Allocation

A receipt or payment reaches bills through `bill_allocations`.

| Allocation type | Meaning | Effect on ageing |
|---|---|---|
| AGAINST_REF | This money settles bill X | Reduces bill X outstanding |
| ADVANCE | Money received before a bill exists | Shows as an unapplied credit for the party |
| ON_ACCOUNT | Money received, not yet tagged to a bill | Shows as unapplied, does not reduce any bill |
| OPENING | Opening bill reference | Seeds the first outstanding list |

Guards, all enforced in the same transaction as the post:

```
allocation.amount_minor > 0
SUM(allocations for a voucher) <= voucher.total_minor
SUM(allocations against a bill) <= bill.total_minor - credit notes
a voucher cannot be allocated to itself
an allocation can only join a RECEIPT or PAYMENT to a SALES, PURCHASE, CREDIT_NOTE or DEBIT_NOTE
```

## 10. Outstanding and ageing

Outstanding is never a column. It is a query:

```
bill.outstanding =
    bill.total_minor
  - SUM(allocations AGAINST_REF against bill)
  - SUM(credit notes linked to bill)
```

Ageing buckets an outstanding bill by `voucher_date` or `due_date`:

```
0-30, 31-60, 61-90, 91-180, 180+
```

The bucket boundaries are settings, not constants. The report is correct because the underlying allocation rows are correct, not because a report job updated a total.

## 11. State machines

Voucher:

```
DRAFT -> POSTED -> CANCELLED
```

Party credit:

```
NORMAL -> AT_LIMIT (warning only) -> ON_HOLD (blocks new credit sale)
```

Number series:

```
next_number = last_value + 1, written inside the posting transaction
```

If the transaction rolls back, the number is not consumed. Cancelled vouchers keep their number, so the series has no gaps in the audit sense.

## 12. What is deliberately absent

These existed in the previous project and do not belong here:

- lead, pipeline stage, follow up, activity
- membership, plan, offer, freeze, proration, cancellation policy
- refund and store credit as separate money objects (replaced by credit notes and advances)
- daily collection report keyed to a gym
- blacklist, member photo, webcam capture
- "organization" as a membership business

The tenancy concept survives under the name company. The RBAC concept survives unchanged.
