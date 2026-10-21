# Testing strategy

Status: design, pre-implementation
Tooling already in the repo: Vitest, Testing Library, Playwright, jsdom, coverage v8.

## 1. What we are protecting

Five things can go wrong in an accounting app, and tests are organised around them:

1. A voucher posts an unbalanced or wrong set of ledger lines.
2. Tax and rounding drift by a paisa, then by a rupee, then by a filing.
3. A bill shows the wrong outstanding because allocations are wrong.
4. A posted document changes after the fact.
5. A report disagrees with the ledger.

Everything else is cosmetic and gets a smoke test.

## 2. Test pyramid

| Layer | Count target | Runs in | Covers |
|---|---|---|---|
| Domain unit | 300+ | under 2 s | money, tax, numbering, posting rules, allocation, ageing |
| Integration | 60+ | under 30 s | repository plus transaction against a real SQLite file |
| Renderer component | 80+ | under 20 s | entry grid, totals panel, allocation picker, filters |
| End to end | 12 | under 3 min | full business scripts in Electron |
| Property | 5 | under 10 s | invariants over generated data |
| Performance | 4 | nightly | report timings on a 50k voucher database |

The current suite has 84 test files, most of them gym domain. Roughly 25 survive or get rewritten.

## 3. Golden fixtures

The two PDFs in `docs/` become JSON fixtures under `tests/fixtures/bills/`.

```json
{
  "name": "purchase-bill-TC-2026-27-583",
  "supplier": { "name": "TechConnect Informatique", "gstin": "27CRBPJ7020H1Z0", "state": "27" },
  "company": { "state": "27" },
  "date": "2026-07-13",
  "lines": [
    { "item": "Epson Ink 003 Black", "hsn": "3215", "qty": 1, "rate": 34000, "discountBps": 1525, "gstBps": 1800 },
    { "item": "Artis Laptop Adapter", "hsn": "8504", "qty": 2, "rate": 45000, "discountBps": 1525, "gstBps": 1800 }
  ],
  "expected": {
    "taxableMinor": 1317333,
    "cgstMinor": 118560,
    "sgstMinor": 118560,
    "roundOffMinor": 47,
    "totalMinor": 1554500
  }
}
```

The test asserts every ledger line, not only the total:

```
Dr Purchases      13,173.33
Dr Input CGST      1,185.60
Dr Input SGST      1,185.60
Dr Round Off           0.47
   Cr Party        15,545.00
```

A second test asserts that the printed tax split differs by one paisa and that the total is identical. That documents the decision rather than hiding it.

The sales bill fixture asserts:

```
Dr Party           4,550.00
   Cr Sales        3,855.93
   Cr Output CGST    347.03
   Cr Output SGST    347.03
   Cr Round Off        0.01
```

## 4. Domain unit tests

### money

- `roundHalfUp` at .5, .4999, .5001, negative values, zero
- paise to rupee string with Indian grouping
- multiplication of quantity scaled by 10,000 with rate in paise
- overflow guard near safe integer limits

### tax

- exclusive rate, intra state and inter state
- inclusive rate, intra state and inter state
- discount percent on gross versus discount amount
- cess stacked on GST
- zero rated and exempt
- per line versus per rate group rounding
- invoice round off positive and negative
- round off above one rupee is rejected

### numbering

- FY label across a March to April boundary
- sequence increments inside a transaction and survives commit
- rollback does not consume
- collision raises
- manual number updates the high water mark

### posting

One test per voucher type, asserting the exact line set. Plus:

- unbalanced input rejected before any write
- parent account rejected
- inactive party rejected for credit sale
- service item produces no stock movement and no COGS line
- goods sale produces COGS equal to the issue cost
- inter state sale uses IGST and not CGST
- cancelled voucher produces a mirror and no net effect

### allocation and ageing

- one receipt across three bills
- over allocation rejected
- on account money does not reduce a bill
- advance later applied to a new bill
- credit note reduces the bill before allocations do
- ageing bucket edges at 30, 60, 90, 180 days
- as of date in the past excludes later receipts
- same party as customer and supplier keeps two balances

## 5. Property tests

Using a small generator, not a library, to keep the suite fast.

```
for 1,000 random voucher sets:
  post all vouchers in one transaction
  assert SUM(debit) == SUM(credit) across the company
  assert every voucher individually balances
  assert stock on hand equals SUM(in) - SUM(out) per item
  assert no negative quantity when policy forbids it
  assert the trial balance report equals the raw ledger sums
```

A second property: cancelling any random subset of vouchers returns the company to the state before those vouchers, to the paisa.

A third: applying a receipt then reversing it returns the bill outstanding to its original value.

## 6. Integration tests

Run against a real SQLite file in a temp directory, not an in memory stub, because the migration runner, foreign keys and WAL behaviour matter.

- migration from empty database
- migration from the previous version
- post a voucher and read it back through every repository
- concurrent post attempts with the same idempotency key produce one voucher
- failed post leaves no rows and no consumed number
- backup and restore round trip
- company isolation: two companies, same voucher number, no leakage

## 7. Renderer tests

Focus on the screens where a bug costs money.

| Screen | Assertions |
|---|---|
| Sales entry | typing a line updates taxable, tax and total; inclusive toggle keeps total and changes taxable; add and remove line; post disabled with a reason when invalid |
| Receipt entry | bill list shows outstanding, typing an amount updates the allocation, over allocation blocked inline |
| Party statement | running balance matches, pagination keeps the carry forward |
| Ageing | bucket totals equal the sum of rows, filter changes rows not totals |
| Dashboard | cards match the fixture numbers |

No snapshot tests of whole pages. They break on copy changes and catch nothing.

## 8. End to end scripts

Playwright against the packaged Electron app, one script per business story.

1. **First run.** Setup company, create user, land on dashboard.
2. **Masters.** Create a customer, a supplier, three items.
3. **Sale and receipt.** Invoice 4,550, receipt 2,000 split, outstanding 2,550, ageing correct.
4. **Purchase.** Bill 15,545 with nine lines, payables correct.
5. **Return.** Credit note against the invoice, stock back, outstanding reduced.
6. **Payment.** Pay the supplier in full, payables zero.
7. **Cancellation.** Cancel the invoice, ledger and stock return to prior state, audit row exists.
8. **Statement.** Print and verify totals against the ledger.
9. **Report tie out.** Trial balance balances, P&L and balance sheet agree.
10. **Backup.** Backup, wipe, restore, numbers identical.
11. **Permissions.** Billing clerk cannot cancel or edit masters.
12. **Keyboard only.** Full invoice and receipt without the mouse.

## 9. Performance tests

Seed a database with 50,000 vouchers, 250,000 item lines, 500,000 ledger lines and five years of dates. Then assert:

| Query | Budget |
|---|---|
| Day book, one month | 300 ms |
| Receivables, 500 parties | 400 ms |
| Ageing, five years | 800 ms |
| Trial balance | 500 ms |

These run nightly, not on every commit. A regression blocks the release, not the pull request.

## 10. CI gates

Every pull request:

```
npm run typecheck
npm run lint
npm test              (unit, integration, renderer)
npm run test:e2e -- --grep @smoke
```

Blocking conditions:

- any failure
- coverage below 70 percent on `src/main/domain`
- a new `any` in `src/main`
- a migration file edited after being added
- a new IPC channel without a contract and a Zod schema

## 11. What we do not test

- PDF pixel output. We assert text content and totals, not layout, except one visual check per template.
- Third party library behaviour.
- Deleting the gym code. Once removed, it is removed.
- Every permutation of UI filters. The domain query behind the filter is tested instead.

## 12. Test data

Two datasets:

- `seed:demo` creates a small trading company with 8 parties, 12 items, 40 vouchers across two months. Used by e2e and by the onboarding "try sample data" option.
- `seed:perf` creates the 50k voucher database. Never shipped, only used by the performance suite.

Both are generated by scripts under `scripts/`, never committed as binary database files.
