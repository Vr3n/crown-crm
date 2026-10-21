# Voucher posting rules

Status: design, pre-implementation
This is the contract the posting engine implements. Every rule here has a test.

## 1. The contract

One posted voucher writes, in one transaction:

1. two or more `ledger_lines` whose debits equal credits
2. zero or more `stock_movements`
3. zero or more `bill_allocations`
4. one `audit_events` row

Nothing else. If any step fails, the whole voucher rolls back and the number is not consumed.

## 2. How the engine decides the lines

The engine never asks the UI what to post. It reads the voucher type and the line data and applies a rule.

```
post(voucher):
  rule = RULES[voucher.type]
  lines = rule.ledger(voucher, context)
  assert sum(debit) == sum(credit)
  assert accounts are postable and belong to the company
  write lines
  write stock movements from rule.stock(voucher)
  write allocations if any
  write audit
```

`context` carries the resolved system accounts and the company state code. Accounts are resolved by `system_key`, so renaming "Sales" to "Revenue from goods" changes nothing.

## 3. Ledger rules by voucher type

### SALES, credit sale

```
Dr  Party (debtor role)          total_minor
Cr  SALES                        taxable_minor
Cr  OUTPUT_CGST                  cgst_minor        (intra state)
Cr  OUTPUT_SGST                  sgst_minor        (intra state)
Cr  OUTPUT_IGST                  igst_minor        (inter state)
Cr  OUTPUT_CESS                  cess_minor        (when cess applies)
Dr/Cr ROUND_OFF                  round_off_minor   (sign follows the difference)
```

If the invoice is fully paid on the spot, the debit goes to CASH or BANK instead of the party. Partial payment on the same screen writes a receipt voucher and an allocation in the same transaction.

### SALES with goods lines, the second entry

```
Dr  COGS                         cost of goods issued
Cr  INVENTORY                    same amount
```

The cost comes from the stock issue that the same post performs. Weighted average or FIFO, decided by company setting. Services post no second entry.

### PURCHASE

```
Dr  PURCHASES or INVENTORY       taxable_minor      (policy: expense or asset)
Dr  INPUT_CGST                   cgst_minor
Dr  INPUT_SGST                   sgst_minor
Dr  INPUT_IGST                   igst_minor
Dr  INPUT_CESS                   cess_minor
Dr/Cr ROUND_OFF                  round_off_minor
Cr  Party (creditor role)        total_minor
```

Version 1 uses the perpetual method, so goods purchases debit INVENTORY. Service purchases and expense purchases debit their expense account. The item line decides: goods to INVENTORY, service to the expense account chosen on the line.

### RECEIPT

```
Dr  CASH or BANK                 amount_minor
Cr  Party (debtor role)          amount_minor
```

### PAYMENT

```
Dr  Party (creditor role)        amount_minor
Cr  CASH or BANK                 amount_minor
```

### CREDIT_NOTE, customer returns goods

Mirror of the sale:

```
Dr  SALES_RETURNS                taxable_minor
Dr  OUTPUT_CGST / SGST / IGST    tax
Dr/Cr ROUND_OFF                  round_off_minor
Cr  Party (debtor role)          total_minor

Dr  INVENTORY                    cost
Cr  COGS                         cost        (goods only)
```

### DEBIT_NOTE, we return goods to a supplier

Mirror of the purchase:

```
Dr  Party (creditor role)        total_minor
Cr  PURCHASE_RETURNS             taxable_minor
Cr  INPUT_CGST / SGST / IGST     tax
Dr/Cr ROUND_OFF                  round_off_minor

Dr  INVENTORY                    cost        (stock goes out)
Cr  ...                          cost
```

### JOURNAL

Free form. The UI asks for account, debit, credit and a narration per row. The only rule is that it balances. Journal cannot touch a party account's bill allocations; use a receipt, payment or note for that.

### CONTRA

```
Dr  BANK                         amount
Cr  CASH                         amount
```

### OPENING

Opening balances for parties, accounts and stock. Posted once, before the first real voucher. If debits do not equal credits, the difference goes to `OPENING_DIFF` and the dashboard shows a banner until it is fixed.

## 4. Stock rules

| Voucher type | Movement | Unit cost |
|---|---|---|
| PURCHASE | in, per goods line | taxable value divided by quantity, plus non recoverable costs if added |
| SALES | out, per goods line | cost from the costing method at issue time |
| CREDIT_NOTE | in | cost of the original issue when known, else current average |
| DEBIT_NOTE | out | current cost at issue |
| STOCK_JOURNAL | out from source godown, in to destination, same cost | carried |
| PHYSICAL_STOCK | difference between counted and book quantity | current average |
| OPENING | in | opening rate entered by the user |

Rules:

1. Quantity is never edited. A correction is a new movement.
2. Negative stock is allowed when the company setting permits it, with a warning at post time. The stock summary shows the negative rows.
3. Stock value never includes recoverable GST. Input GST is an asset, not part of inventory cost.
4. Cost of goods sold on a sale equals the sum of the issue costs for that voucher, not a recomputation from the master.

## 5. Tax computation, exact order

All arithmetic is integer. No floats anywhere in the money path.

```
1. gross      = qty_e4 * entered_rate_minor / 10000          (rounded half up)
2. discount   = gross * discount_bps / 10000                  (rounded half up)
3. net        = gross - discount

4. if rate_includes_tax:
     taxable  = net * 10000 / (10000 + gst_rate_bps)           (rounded half up)
     tax      = net - taxable
   else:
     taxable  = net
     tax      = taxable * gst_rate_bps / 10000                 (rounded half up)

5. intra state:  cgst = tax / 2 (rounded down), sgst = tax - cgst
   inter state:  igst = tax

6. line_total = taxable + cgst + sgst + igst + cess
```

Rounding is half up on absolute values. One rounding function, used everywhere, unit tested with negative and zero inputs.

Invoice totals:

```
taxable   = SUM(line taxable)
tax       = SUM(line cgst, sgst, igst, cess)
pre_round = taxable + tax
total     = round to nearest rupee when round_off_mode = INVOICE
round_off = total - pre_round
```

`round_off` is its own ledger line against `ROUND_OFF`. It is the only line allowed to be negative on either side.

## 6. Worked example: purchase bill TC/2026-27/583

Nine lines, 15.254 percent discount on the first six, GST 18 percent split as CGST 9 and SGST 9, same state.

| Line | Rate | Qty | Gross | Discount | Taxable |
|---|---|---|---|---|---|
| Epson Ink 003 Black | 340.00 | 1 | 340.00 | 51.86 | 288.14 |
| Epson Ink 003 Cyan | 485.00 | 1 | 485.00 | 73.98 | 411.02 |
| Epson Ink 003 Magenta | 485.00 | 1 | 485.00 | 73.98 | 411.02 |
| Epson Ink 003 Yellow | 485.00 | 1 | 485.00 | 73.98 | 411.02 |
| Artis Laptop Adapter | 450.00 | 2 | 900.00 | 137.29 | 762.71 |
| LG 18.5 inch monitor | 5,150.00 | 1 | 5,150.00 | 785.58 | 4,364.42 |
| Intel Core i5 | 1,075.00 | 1 | 1,075.00 | 0.00 | 1,075.00 |
| 8GB DDR4 RAM | 3,150.00 | 1 | 3,150.00 | 0.00 | 3,150.00 |
| TP-Link Router C6 | 2,300.00 | 1 | 2,300.00 | 0.00 | 2,300.00 |
| **Total** | | **10** | | | **13,173.33** |

The printed bill shows CGST 1,185.59 and SGST 1,185.59. Our per HSN group computation gives 1,185.60 each, because 9 percent of 1,521.20 is 136.908 and half up rounds to 136.91. The printed bill truncates that group.

Both are defensible. What matters is which rule we ship and that the total is preserved:

```
taxable        13,173.33
CGST            1,185.60
SGST            1,185.60
pre round      15,544.53
round off           0.47
total          15,545.00     <- identical to the printed bill
```

Ledger lines:

```
Dr Purchases        13,173.33
Dr Input CGST        1,185.60
Dr Input SGST        1,185.60
Dr Round Off             0.47
   Cr TechConnect    15,545.00
```

The 0.47 round off absorbs the rounding difference. This is why round off is an account and not a hidden adjustment.

## 7. Worked example: sales invoice 84/2026-27

One line, SSD 3,855.93, GST 18 percent split, same state.

```
taxable         3,855.93
CGST 9%           347.03
SGST 9%           347.03
pre round       4,549.99
round off           0.01
total           4,550.00
```

Ledger lines:

```
Dr Acme Distributor  4,550.00
   Cr Sales          3,855.93
   Cr Output CGST      347.03
   Cr Output SGST      347.03
   Cr Round Off          0.01
```

Cost entry, assuming the unit cost on the shelf is 3,200.00:

```
Dr COGS              3,200.00
   Cr Inventory      3,200.00
```

Stock movement: `qty_out = 1`, `unit_cost = 3,200.00`.

## 8. Allocation rules

A receipt or payment may settle many bills. A bill may be settled by many receipts.

```
allocate(receipt, bill, amount, type):
  assert receipt.status == POSTED and bill.status == POSTED
  assert receipt.type in (RECEIPT, PAYMENT)
  assert bill.type in (SALES, PURCHASE, CREDIT_NOTE, DEBIT_NOTE)
  assert receipt.company_id == bill.company_id
  assert amount > 0
  assert amount <= receipt.unallocated
  assert amount <= bill.outstanding
  assert receipt.party_id == bill.party_id when both set
  write allocation
```

`unallocated = receipt.total - SUM(allocations from receipt)` and is computed, not stored.

Allocation types:

| Type | Use | Reduces a bill | Counts as advance |
|---|---|---|---|
| AGAINST_REF | Money against a known bill | Yes | No |
| ADVANCE | Money before the bill exists | No | Yes |
| ON_ACCOUNT | Money with no instruction yet | No | Yes |
| OPENING | Opening bill reference | Yes, from day zero | No |

A receipt can be split: 1,500 against bill A, 500 on account. The on account part waits.

## 9. Cancellation

Cancelling a posted voucher:

1. Creates a mirror voucher with `reversal_of_voucher_id` set and `status = POSTED`.
2. Mirror lines swap debit and credit, quantities reverse, allocations reverse.
3. Both vouchers appear in the day book, greyed and linked.
4. An audit event records who cancelled, when, and why.
5. The number is not returned to the pool.

What cannot be cancelled:

- a voucher with allocations against it, unless the allocations are reversed first
- a voucher in a locked financial year
- a stock journal that would create negative stock under a strict policy

## 10. Guards, in one place

| Guard | Error code |
|---|---|
| Debits do not equal credits | `VOUCHER_UNBALANCED` |
| Account is a parent or control account | `ACCOUNT_NOT_POSTABLE` |
| Account belongs to another company | `CROSS_COMPANY_REFERENCE` |
| Party is inactive or not allowed this voucher type | `PARTY_NOT_ALLOWED` |
| Voucher date is outside an open financial year | `PERIOD_LOCKED` |
| Duplicate idempotency key | returns the original voucher, no error |
| Allocation exceeds the bill | `ALLOCATION_EXCEEDS_BILL` |
| Allocation exceeds the payment | `ALLOCATION_EXCEEDS_PAYMENT` |
| Negative quantity or rate | `INVALID_LINE_VALUE` |
| Round off magnitude above one rupee | `ROUND_OFF_TOO_LARGE` |
| Duplicate voucher number | `NUMBER_COLLISION` |
| Item used is inactive | warning, allowed |

## 11. What the clerk sees

| Screen | Shows | Hides |
|---|---|---|
| Sales entry | Item, qty, rate, discount, GST, line total, grand total, tax summary | Account names, debit, credit |
| Receipt | Party, outstanding bills, amount, allocation rows | Controlling accounts |
| Party statement | Date, document, debit, credit, running balance | Internal keys |
| Day book | All vouchers with totals | Ledger detail unless expanded |
| Trial balance | Account, debit, credit | Voucher lines unless drilled |

The trial balance and ledger are the only screens that speak Dr and Cr. Everyone else sees money in and money out.
