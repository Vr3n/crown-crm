# Reports specification

Status: design, pre-implementation
Rule: every report is a read of vouchers, ledger lines, stock movements and allocations. No stored totals, no report tables, no nightly jobs.

## 1. Report map

| Report | Answers | Ships |
|---|---|---|
| Dashboard | Money in, money out, what is owed, what we owe | V1 |
| Receivables | Who owes us, how much, how old | V1 |
| Payables | Who we owe, how much, how old | V1 |
| Party statement | Full account history with running balance | V1 |
| Day book | Every voucher, in date order | V1 |
| Ledger | One account, all movements | V1 |
| Trial balance | Do the books balance | V1 |
| Profit and loss | Did we make money | V1 |
| Balance sheet | What we own and owe | V1 |
| Sales register | Invoice wise GST detail | V1 |
| Purchase register | Bill wise GST detail | V1 |
| Ageing by party and bill | Collections and payment planning | V1 |
| Stock summary | Quantity and value on hand | Phase 5 |
| Item movement | Why stock changed | Phase 5 |
| Negative stock | Data entry gaps | Phase 5 |
| GSTR-1 working | Outward supplies for filing | Phase 6 |
| GSTR-3B working | Output tax less input tax | Phase 6 |
| HSN summary | Rate wise turnover | Phase 6 |
| Bank reconciliation | Book versus bank | Phase 7 |
| Cash and bank book | Daily cash position | Phase 7 |

## 2. Shared report conventions

1. Date range defaults to the current financial year to date, with quick options: this month, last month, this quarter, this FY, custom.
2. Company context is implicit and never blended.
3. Money is right aligned, tabular numerals, two decimals, Indian grouping (1,23,456.00).
4. Every table can be exported to Excel with the same columns and totals.
5. Every row that shows a party or a bill can be drilled to the source voucher.
6. Printed reports carry company name, period, generation timestamp and page numbers.
7. Zero rows show a composed empty state, not a blank grid.

## 3. Dashboard

Four question cards, then detail.

| Card | Value | Comparison |
|---|---|---|
| Money in | Receipts this month | Previous month, percent |
| Money out | Payments this month | Previous month, percent |
| Receivables | Total outstanding | Overdue amount and percent |
| Payables | Total outstanding | Due in the next 7 days |

Below: cash and bank balances per account, top five overdue parties, recent vouchers, and an attention list (overdue bills, negative stock, opening difference not zero, unallocated advances).

The dashboard never shows a number that cannot be drilled to rows in one click.

## 4. Receivables

Two levels, party wise and bill wise, in one screen with a toggle.

Party wise columns:

```
Party | GSTIN | Credit days | Not due | Overdue | Total | Oldest bill days
```

Bill wise columns:

```
Party | Bill no | Bill date | Due date | Total | Received | Credit notes | Outstanding | Days overdue | Bucket
```

Filters: as of date, include zero balances, customer only, search by name or GSTIN, bucket.

Sort default: overdue descending, then amount descending.

Total row must equal the sum of the visible rows.

## 5. Ageing

Same data as receivables, pivoted.

```
Party | 0-30 | 31-60 | 61-90 | 91-180 | 180+ | Total
```

Controls:

- basis: bill date or due date
- bucket edges editable, defaults 30 / 60 / 90 / 180
- as of date

The report is a pure function of posted bills, allocations and notes dated on or before the as of date. A cancellation after the as of date does not change history.

## 6. Party statement

The document a shop sends when chasing money.

```
Header: party name, address, GSTIN, period, opening balance
Rows: date, document type, number, debit, credit, running balance
Footer: closing balance, ageing summary, bank details, terms
```

Rules:

1. Opening balance is the balance before the period, computed from rows.
2. Debit and credit are shown from the company's point of view.
3. Running balance carries across pages.
4. The PDF is the same layout as the print.
5. A statement can be generated for a customer or a supplier.

## 7. Day book

```
Date | Type | Number | Party | Total | Status | Created by
```

Expand a row to see its ledger lines and stock movements. This is the audit surface for a clerk's day.

## 8. Ledger and trial balance

Ledger:

```
Date | Voucher type | Number | Narration | Debit | Credit | Balance
```

Trial balance:

```
Account | Group | Opening Dr | Opening Cr | Period Dr | Period Cr | Closing Dr | Closing Cr
```

Assertion shown on screen: total closing debit equals total closing credit, with a green check or a red banner. If it fails, the screen links to the integrity report.

## 9. Profit and loss

```
Sales
  less Sales returns
Net sales
Cost of goods sold
Gross profit
Direct expenses
Indirect expenses
Other income
Profit before tax
```

Every line drills to the ledger. Percent of net sales column for the accountant.

## 10. Balance sheet

```
ASSETS                         LIABILITIES AND EQUITY
Cash and bank                  Sundry creditors
Sundry debtors                 Output GST net of input
Inventory                      Loans
Fixed assets                   Capital
                               Retained earnings
```

Current period profit is shown inside equity, not hidden. The sheet must balance; if it does not, the screen says so and links to the integrity report.

## 11. Sales and purchase registers

Sales register columns:

```
Date | Invoice | Party | GSTIN | Place of supply | Taxable | CGST | SGST | IGST | Cess | Round off | Total | Status
```

Group by month, with subtotals. Purchase register mirrors it and adds input tax.

Both registers have an "invoice wise" and a "rate wise" view. The rate wise view is the precursor to the HSN summary.

## 12. Export

Excel export uses the existing `exceljs` dependency. One workbook per report, one sheet per section, a header block with company and period, frozen header row, numeric cells as numbers (not text), totals as formulas so the recipient can audit them.

PDF export uses the existing renderer, extended with:

- tax invoice (A4, GST compliant layout)
- purchase bill view
- statement of account
- ageing report
- day book

## 13. Performance targets

| Report | Rows | Target |
|---|---|---|
| Day book, one month | 2,000 vouchers | under 300 ms |
| Receivables, 500 parties | 5,000 open bills | under 400 ms |
| Ageing, 5 years of history | 50,000 bills | under 800 ms |
| Trial balance, 200 accounts | all rows | under 500 ms |
| Party statement, 3 years | 2,000 rows | under 300 ms |

Measured on a 5 year old database on the target machine class, not on an empty one. If a target is missed, add an index before adding a cache.
