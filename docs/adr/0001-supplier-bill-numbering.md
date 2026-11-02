# ADR 0001 — A purchase bill is numbered by its supplier

Status: accepted
Date: 2026-11-02

## Context

`docs/04-tax-rounding-and-numbering.md` gives every voucher type its own series,
so purchase bills were issued `PUR/0001`. That is the wrong identity for a
purchase bill: the number that matters on a purchase is the one the supplier
printed, because GSTR-2B reconciliation, supplier follow-up and duplicate
detection all match on it. Our `PUR` number had no outside meaning, while the
supplier's number sat in an optional free-text "Reference" field.

## Decision

1. A purchase bill's `number` is the supplier's bill number, entered exactly as
   printed (trimmed ends only, 1–32 characters).
2. A purchase with no supplier bill takes the internal `PUR` sequence, because
   every voucher still needs a number.
3. Duplicate detection is per supplier and financial year, on a normalized form
   of the number (uppercase, spaces and `- / .` removed). A cancelled voucher
   does not reserve a number.
4. Posted purchase vouchers keep the numbers they were issued. No renumbering.
5. Sales invoices and every other voucher type keep the internal sequence from
   `docs/04`.

## Consequences

- `vouchers.number` alone no longer identifies a purchase voucher uniquely
  across suppliers; the pair (supplier, number, financial year) does.
- The purchase print shows the supplier's number as **Supplier Bill No.** and as
  **Voucher No.**, because for these vouchers they are the same document.
- Reports and drill-down already use the voucher id, so they are unaffected.
- A supplier who reuses a number in a later financial year is allowed, matching
  GST Rule 46(b) which requires uniqueness within the supplier's financial year.

## Alternatives rejected

- **Keep `PUR` and promote the reference field.** Rejected: the user does not
  want to see or quote an internal purchase number; it duplicates the identity
  and confuses the paperwork.
- **Enforce the 16-character GST format.** Rejected: that rule binds our own tax
  invoices, not a supplier's document.
- **Unique across all time.** Rejected: legitimate reuse across financial years
  would be blocked.
