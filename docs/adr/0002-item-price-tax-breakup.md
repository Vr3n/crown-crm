# ADR 0002 — An item stores the typed price and how tax sits inside it

Status: accepted
Date: 2026-11-02

## Context

The item master stores `sale_price_minor` and `purchase_price_minor` with no
statement about whether tax is included, and the voucher line hardcoded
`rate_includes_tax = false`. In the business, the sale price is what the
customer pays (2500 including GST), while the purchase price is a base that the
supplier adds tax to (1750 + 18%). Today the form cannot express either.

## Decision

1. Each price side stores the price **as typed** plus an `..._includes_tax` flag.
   Nothing is converted on save.
2. Sales default to tax-inclusive (`2500` means the customer pays 2500, taxable
   2118.64 at 18%). Purchase defaults to tax-exclusive; the bill line shows the
   landed cost (2065) but posts 1750 plus input tax separately.
3. Both sides use the item's single GST rate and optional cess. A one-off
   supplier rate is overridden on the voucher line, not in the item master.
4. The item form shows a live breakup under each price: taxable, tax, gross.
5. Voucher lines inherit the item's flag and may override it per line.
6. Posted vouchers are unaffected: they already snapshotted rate and tax.

## Consequences

- One price column per side, no derived duplication.
- The item list and voucher line must display gross and taxable consistently;
  the formatter becomes the single place the arithmetic lives.
- A price edit changes future lines only.

## Alternatives rejected

- **Store only taxable price and derive gross.** Rejected: the user thinks and
  quotes in the gross price; rounding back and forth invents paise.
- **Separate purchase and sale tax rates.** Rejected: GST follows HSN, not the
  direction of trade. Per-line override covers rare exceptions.
- **Store gross only.** Rejected: the purchase line must post a taxable rate and
  separate input tax.
