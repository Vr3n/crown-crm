# Voucher entry refresh

Implements issue #3. The purchase bill and sales invoice share one page.

## What changed

- `features/vouchers/components/party-picker.tsx` replaces the borderless
  native select with a visible combobox. It shows the party balance, credit
  days and GSTIN, searches name, phone and GSTIN, and opens on click or `F4`.
- `features/vouchers/components/item-picker.tsx` replaces the per-line item
  select. It searches name, SKU and HSN, keeps the free text option, and still
  fills description, HSN, unit, rate and GST from the item.
- The page is split into numbered sections: Party and dates, Lines, then
  Summary. Each carries a per-document accent: sales blue, purchases vermilion,
  notes amber.
- The lines table has a sticky header, a stronger rule, a row focus highlight
  and a right-aligned emphasised amount column.
- The summary rail sticks on desktop and the action bar sticks to the bottom.
  The preview stays local; the posted values remain server-computed.

## Unchanged on purpose

- The line maths in `previewLine` and `previewTotals`.
- Keyboard shortcuts: `Alt+A` add line, `Ctrl+Enter` post, `Esc` back, plus the
  new `F4` party picker.
- The posting payload and every server-side rule.

## Tests

- Playwright `tests/e2e/ux-refresh.spec.ts` selects a supplier and an item
  through the new pickers and posts a bill, asserting the number.
- `tests/e2e/phases-flow.spec.ts` exercises the same path for both a purchase
  and a sale, then pays and receives against the posted documents.
- Server-side totals remain covered by `tests/main/application/vouchers.test.ts`.

## Adding a document type

1. Add the type to `META` with its title, series, back link and accent.
2. The party role follows the type; notes keep the existing customer or
   supplier role.
3. Reuse `Section`, `HeaderField` and `ItemPicker`; do not add a second entry
   layout.
