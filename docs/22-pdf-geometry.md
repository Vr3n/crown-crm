# 22 — PDF geometry and border ownership

Three producers draw a printed document: the native `printpdf` invoice, the
React invoice sheet, and the generic `window.print()` used by reports and
statements. They used to carry their own constants, which is why a frame could
be missing on one producer and doubled on another. This document records the
single geometry contract and the border rules both invoice producers follow.

## Defect audit

| Defect | Producer | Cause |
| --- | --- | --- |
| Whole-sheet frame missing on all four sides | Native PDF | `draw_copy` drew only a rule under the title; no `rect` around the sheet. |
| SUPPLIER panel had no box; bottom edge did not meet the meta grid | Native PDF | Text was drawn without a panel rect, and the panel ended at the last supplier line instead of the taller meta grid. |
| Totals box had no left, right or bottom edge | Native PDF | Only a horizontal rule above `Total` was drawn. |
| Tax summary had no verticals or outer edge | Native PDF | Header and rows drew horizontal rules only. |
| Item table had no left or right edge | Native PDF | Header/rows drew interior verticals and a bottom rule, never the outer verticals. |
| Header and cell text used different alignment rules | Native PDF | Header right-aligned Rate/Amount but centred HSN, quantity and discount while the body used another mix. |
| Frame and table header missing after a page break | Native PDF | `continue_page` reset `y` and drew the title but not the sheet frame; rows only redrew the table header. |
| Sheet frame missing on screen and print | React sheet | `.invoice-sheet` had no frame; only the inner panels were bordered. |
| Item table relied on collapsed borders from both neighbours | React sheet | `border-collapse: collapse` plus `border` on every cell made edge ownership implicit. |
| Numeric and code columns did not agree between the two producers | React + native | The renderer right-aligned every cell; the native builder centred several of them. |
| Report print lost table rules and header | Generic report print | No print stylesheet; row `border-b` utilities are not enough for a paged table, and the app chrome stayed in the output. |
| Report print had no document identity | Generic report print | No company, period, generated timestamp or page footer. |

## The spec

`src/shared/print-geometry.json` is the only place these values live. Rust
reads it at compile time with `include_str!` and `serde_json`; the renderer
imports it through `src/shared/print-geometry.ts`.

| Group | Value |
| --- | --- |
| Page | A4, 210 × 297 mm |
| Content margins | 8 mm top, 12 mm right, 6 mm bottom, 12 mm left |
| Sheet frame | 5 mm top/bottom inset, 6 mm left/right inset |
| Supplier/meta split | 5 mm gap, 92 mm meta grid |
| Buyer gap | 4.5 mm |
| Item table | 7 mm header, 7.2 mm minimum row, 268 mm break line |
| Item columns | 7 / 39 / 13 / 11 / 15 / 8 / 10 / 19 |
| Tax summary | 6.4 mm header, 6.2 mm row |
| Border classes | outer 0.8 pt, section 0.5 pt, cell 0.4 pt, total 0.8 pt |

The item weights describe the eight columns in order: S.No, description,
HSN/SAC, quantity, rate, per, discount and amount. They sum to 122, so a change
to one weight changes every column and both producers at once.

The tax-summary weights are keyed by role (`hsn`, `taxable`, `rate`, `tax`,
`cessRate`, `cess`, `total`) because the number of visible columns changes for
inter-state and cess documents.

## Border ownership

A rule must have exactly one owner. The two producers express that differently,
but the resulting edges are the same.

### Native PDF

- `rect(x, y, w, h, weight)` emits exactly four edges: top, right, bottom and
  left. Every panel, totals box, declaration box and table block uses it.
- A table header is a full rect. Interior column separators are separate
  vertical edges derived from the shared column positions.
- A table row draws its left and right vertical edges, its interior
  separators, and one bottom edge. It never draws a top edge, because the
  header or the previous row already owns that boundary.
- The totals box owns its outer edge. Row separators inside it are drawn only
  between rows, and the grand-total boundary uses the `total` weight once.
- The sheet frame is outside the content margins, so it never shares an edge
  with the supplier, buyer or declaration panel.
- `continue_page` redraws the frame, the title and the caption before
  `draw_lines` repeats the table header.

`rect_edges` and `table_separators` are pure helpers and unit tested. A
duplicate separator is a test failure, not a visual review item.

### React sheet

- `border-collapse: separate; border-spacing: 0`.
- Every `th` and `td` gets `invoice-cell`, which owns `border-right` and
  `border-bottom`.
- The first cell of every row gets `is-first`, which owns `border-left`. It is
  repeated on each row so a table that breaks across pages keeps its left edge
  on the continuation page.
- Header cells get `is-head`, which owns `border-top`. `thead` repeats on every
  printed page, so the top edge repeats too.
- No cell declares `border-left` unless it is `is-first`, and no cell declares
  `border-top` unless it is a header cell. Adjacent cells therefore cannot
  double an edge.
- The screen frame is an inset `::after` pseudo-element. In print it is hidden
  and replaced by `.invoice-print-frame`, a fixed element that repeats on every
  page. That is what keeps the outer frame on a continuation page.
- `.invoice-meta` is the one grid that uses the container for top/left and the
  cells for right/bottom; it has a fixed row count and never breaks across
  pages.

## Alignment

- S.No, quantity, rate, discount and amount are flush right against
  `column.right - cellPaddingX`.
- Description is flush left against `column.x + cellPaddingX`.
- HSN/SAC and `per` are centred.
- Header text uses the same column object and the same padding as the cell
  text, so a header cannot drift from its column.
- Header labels wrap at the same usable width as the cell content. The native
  builder keeps a conservative glyph-width estimate so right-aligned text stops
  before the edge instead of crossing the border.

## Generic report and statement print

`src/renderer/src/features/reports/report-print.css` supplies the report print
surface:

- `.app-shell`, `.app-body` and `.app-main` lose their fixed height and
  overflow clipping; the sidebar and top bar carry `print:hidden`.
- The report toolbar and page header actions carry `.report-print-hide`.
- Tables keep all four cell borders, `thead` repeats, and rows avoid breaking
  inside a line.
- `.report-print-head` prints the company, report title, period and generated
  timestamp.
- `.report-print-foot` prints the company, report title and generated
  timestamp. Page numbering uses the paged-media margin box in the `@page` rule
  injected by `ReportsPage`; Chromium-based webviews defer page numbering to the
  print dialog when they do not implement margin boxes.
- The `@page` rule is injected only while `ReportsPage` is mounted, so it does
  not change the invoice print route's zero-margin page.

## Tests

- `src-tauri/src/export/invoice_pdf.rs` tests `rect_edges`, column arithmetic,
  separator uniqueness, A4 page count and the overflowing fixture. It writes
  `src-tauri/target/test-output/invoice.pdf` and `invoice-overflow.pdf`.
- `tests/renderer/invoice-sheet.test.tsx` checks that every `th`/`td` has the
  `invoice-cell` class, that alignment is exclusive, that only the first cell
  owns the left edge, and snapshots the class structure.
