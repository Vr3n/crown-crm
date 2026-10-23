# Tax, rounding, numbering and idempotency

Status: design, pre-implementation
Scope: India GST for version 1. The schema does not prevent a second tax regime later, but no generic tax engine is built now.

## 1. Place of supply

The split between CGST plus SGST and IGST is decided by comparing two state codes:

```
supplier_state = company.state_code
place_of_supply = voucher.place_of_supply_state_code
               ?? party.state_code
               ?? company.state_code

intra_state = supplier_state == place_of_supply
```

- Intra state: CGST and SGST, half the tax each. SGST absorbs the odd paisa.
- Inter state: IGST for the whole tax.
- Export, SEZ and deemed export are phase 6. Version 1 records place of supply and blocks zero rated treatment to avoid a wrong return.

The place of supply is stored on the voucher, not derived at read time. Moving the company to another state later must not rewrite old bills.

## 2. Rates as data

```
tax_rates(company_id, gst_rate_bps, cess_rate_bps, effective_from, effective_to)
```

Seeded: 0, 5, 12, 18, 28 percent, effective from the books begin date, no end date.

Rules:

1. The item carries a default rate. The line snapshots the rate actually used.
2. A rate change inserts a new row and closes the old one with `effective_to`.
3. Reports never read the current rate table to explain an old bill.
4. Composition scheme and exempt goods are modelled as rate 0 with a note, not as a separate document type.

## 3. Rounding policy

Three places round:

| Place | Rule | Where it lands |
|---|---|---|
| Line discount | Half up on the gross amount | `discount_minor` |
| Line tax | Half up per line, then per tax rate group | `cgst_minor` etc |
| Invoice total | Nearest rupee, half up | `round_off_minor` |

`round_off_mode` is a company setting:

- `INVOICE` (default): one round off line per voucher
- `LINE`: round each line total, no invoice round off
- `NONE`: exact paise total, no rounding

Why one account: the trial balance must absorb rounding somewhere, and a visible round off line lets the accountant explain a one paisa difference to an auditor. A hidden adjustment cannot be explained.

Exact function contract:

```
roundHalfUp(numerator, denominator):
  sign = sign(numerator)
  q = (abs(numerator) * 2 + denominator) / (2 * denominator)   // integer division
  return sign * q
```

Unit tests cover 0.5 up, 0.4999 down, negative amounts, and large values near `Number.MAX_SAFE_INTEGER / 100`.

## 4. Voucher numbering

```
voucher_number_settings(company_id, voucher_type, series, prefix, suffix, padding, start_number, restart_yearly, manual_override)
voucher_sequences(company_id, voucher_type, series, fy, prefix, suffix, last_value, padding)
```

Settings are per company and voucher type, edited from Company settings. The
per-year counters stay in `voucher_sequences`.

Format: `prefix + zero padded value + suffix`, for example `TC/` + `0583`.

Rules:

1. One sequence per company, voucher type, series and financial year. When
   yearly restart is off the counter is keyed `ALL`.
2. Financial year label is `2026-27`, derived from `fy_start_month` and the voucher date.
3. The first number in a period is `start_number`, not always 1.
4. Changing a prefix, suffix or width affects the next number only.
5. Changing the series starts a new sequence. Posted vouchers keep the series they were issued with.
6. The increment happens inside the posting transaction. A rollback does not consume a number.
7. Cancelled vouchers keep their number. No reuse, ever.
8. Manual numbers are allowed only if the series permits it. A manual number must be at least the starting number and greater than the last used value; it raises the high water mark.
9. A collision is a hard failure, not a retry, because a retry would mask a corrupted sequence.

Example defaults seeded per company:

| Type | Series | Example |
|---|---|---|
| SALES | INV | INV/0001 |
| PURCHASE | PUR | PUR/0001 |
| RECEIPT | RCT | RCT/0001 |
| PAYMENT | PAY | PAY/0001 |
| CREDIT_NOTE | CN | CN/0001 |
| DEBIT_NOTE | DN | DN/0001 |
| JOURNAL | JV | JV/0001 |
| CONTRA | CTR | CTR/0001 |

## 5. Financial year and period lock

A voucher's `fy` is derived from `voucher_date` and `company.fy_start_month`. Posting into a closed year is refused with `PERIOD_LOCKED`.

Closing a year does not move balances. Opening balances for the next year are generated from account balances as of the close date, and a closing entry moves income and expense accounts to Retained Earnings when the accountant asks for it. Version 1 ships period lock; the closing entry is phase 6.

## 6. Idempotency

Every mutating IPC call carries a client generated key.

```
idempotency(company_id, channel, key, response_json, created_at)
unique (company_id, channel, key)
```

Behaviour:

1. First call: execute, store the response, return it.
2. Repeat call with the same key: return the stored response, do not execute.
3. Repeat call with the same key but a different payload: return `IDEMPOTENCY_CONFLICT`.

This is what makes a double click, a retried IPC after a renderer reload, or a slow double submit safe. It is already implemented in the current project and carries over unchanged.

## 7. Ledger posting and tax together

Output tax is a liability, not income. Input tax is an asset, not an expense. The posting rules already enforce this, but it is worth stating the consequence:

```
GST payable this period = SUM(output tax credits) - SUM(input tax debits)
```

If that number is negative, the business carries a credit forward. The Phase 6 GSTR-3B working paper reads this from ledger lines, not from voucher totals, so a misclassified manual journal shows up as an exception.

## 8. What the two sample bills prove

| Claim | Sales bill 84/2026-27 | Purchase bill TC/2026-27/583 |
|---|---|---|
| Tax inclusive and exclusive rates both handled | Exclusive: 3,855.93 plus tax | Exclusive with discount: 340.00 less 15.254 percent |
| Per line discount | None | Nine lines, six discounted |
| Intra state split | CGST 347.03, SGST 347.03 | CGST 1,185.60, SGST 1,185.60 |
| Round off is a real line | 0.01 | 0.47 |
| Total matches the printed bill | 4,550.00 | 15,545.00 |
| Taxable value matches | 3,855.93 | 13,173.33 |
| Difference from the printed tax split | None | 1 paisa per side, absorbed by round off |

The plan is honest about the one paisa. Chasing a third party's truncation rule would make our own books inconsistent. Reproducing the total and the taxable value, and explaining the tax split, is the correct behaviour for an accounting system.

## 9. Future tax work

Not in version 1, but the schema already supports it:

- e-invoice IRN and QR payload (turnover above 5 crore, needs connectivity)
- e-way bill JSON for goods movement above the threshold
- GSTR-1 invoice wise export
- GSTR-3B working paper
- HSN summary with quantity
- reverse charge mechanism flag on purchase lines
- TDS and TCS sections
- multi currency with exchange rate snapshot on the voucher
