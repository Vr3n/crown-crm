# 17 — Invoice Printing and Two-Copy PDF

Sales invoices and purchase bills print as a real tax-invoice document, not as
the voucher detail screen. One export produces a single PDF with two A4 pages:
the **ORIGINAL FOR RECIPIENT** and the **DUPLICATE FOR TRANSPORTER**. Every
other voucher type keeps the detail page's `window.print()` behaviour.

## Research

Tally's invoice printing was the starting point, not a template to copy
blindly. The parts that matter here are the copy captions, the company block,
the party block, the item grid, the rate-wise tax analysis and the footer.

- Tally print overview — <https://help.tallysolutions.com/print-documents/>
- Tally printing FAQs — <https://help.tallysolutions.com/printing-faqs/>
- Configure print, export and share — <https://help.tallysolutions.com/configure-for-print-export-share/>
- Customise and print templates — <https://help.tallysolutions.com/customise-and-print-templates/>
- GST Rule 48(1), tax invoice copies — <https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter6/rule48_v1.00.html>
- Rule 48 text mirror — <https://indiankanoon.org/doc/94848871/>
- `printpdf` 0.7 — <https://docs.rs/printpdf/0.7.0/printpdf/>
- CSS Paged Media Level 3 — <https://www.w3.org/TR/css-page-3/>
- CSS `@page` — <https://developer.mozilla.org/en-US/docs/Web/CSS/@page>

What the research settled:

- Tally lets each voucher type choose how many copies print, and asks for the
  "Type of Copy" when printing (`Alt+P` configurations, `F5` at print time).
  This app fixes the two copies for sales and purchase because that is the
  workflow the business asked for.
- The document title ("Tax Invoice") is editable in Tally's header
  information. The printed title here is derived from the voucher type.
- Tally's GST invoice template carries the company details, party and invoice
  details, item table, GST analysis and footer details (bank, declaration,
  terms, jurisdiction, signature). The layout below follows that order.

`docs/sales-bill.pdf` and `docs/purchase-bill.pdf` are Ghostscript prints of an
Excel GST bill, not Tally output. They were used only to check which fields a
real Indian tax invoice carries (place of delivery, buyer's GSTIN, bank block,
numbered terms, "Subject to … jurisdiction").

## Copy captions

GST Rule 48(1) names the three copies of a goods invoice:

| Copy | Caption                   | Who keeps it           |
| ---- | ------------------------- | ---------------------- |
| 1    | ORIGINAL FOR RECIPIENT    | The buyer              |
| 2    | DUPLICATE FOR TRANSPORTER | Travels with the goods |
| 3    | TRIPLICATE FOR SUPPLIER   | The seller             |

This app prints copies 1 and 2, in that order, one per A4 page. The caption
sits under the document title and repeats discreetly in the page footer so a
loose page can still be identified.

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                        TAX INVOICE        ORIGINAL FOR RECIPIENT │
├───────────────────────────────────────┬──────────────────────────┤
│ SUPPLIER                              │ Invoice No.  │ Dated     │
│ [logo] Company / supplier name        │ Delivery Note│ Mode of   │
│ address, city, pincode                │ Supplier's   │ Payment   │
│ Phone · Email                         │   Ref.       │ Other Ref.│
│ GSTIN/UIN · PAN/IT No. · State        │ ... Tally transport grid │
│                                       │ Place of Delivery        │
├───────────────────────────────────────┴──────────────────────────┤
│ BUYER                                                            │
│ Party name                                                       │
│ address                                                          │
│ Phone · Email                                                    │
│ GSTIN/UIN · PAN/IT No. · State                                   │
├──┬────────────────┬─────────┬──────────┬───────┬─────┬──────┬────┤
│# │Description     │HSN/SAC  │Quantity  │Rate   │per  │Disc %│Amt │
│  (the item table stretches to fill the page)                     │
├───────────────────────────────────────┬──────────────────────────┤
│ Bank details                          │ Taxable Value            │
│                                       │ CGST/SGST or IGST rows   │
│                                       │ Round Off                │
│                                       │ TOTAL                    │
├───────────────────────────────────────┴──────────────────────────┤
│ Amount (in Words)                                        E.&E.O.│
│ HSN/SAC-wise tax summary                                         │
│ Tax Amount (in words)                                            │
│ Terms & Conditions (sales only)                                  │
├───────────────────────────────────────┬──────────────────────────┤
│ Declaration                           │ For <issuer>             │
│                                       │ Authorised Signatory     │
├───────────────────────────────────────┴──────────────────────────┤
│ Subject to <jurisdiction> · Computer generated · copy · page     │
└──────────────────────────────────────────────────────────────────┘
```

The second page repeats the same sheet with `DUPLICATE FOR TRANSPORTER`.

The content follows the two sample bills in `docs/sales-bill.pdf` and
`docs/purchase-bill.pdf`: a bordered `SUPPLIER` panel and the Tally meta grid at
the top, a bordered `BUYER` panel, the S.No/Description/HSN/Quantity/Rate/per/
Disc./Amount grid, totals with a CGST/SGST or IGST row per rate, amount in
words, the HSN/SAC-wise tax summary, tax in words, terms, a declaration and the
signature block.

Both party panels share the same header style, a muted strip above the details.
The document title is centred on the page; the copy caption sits in the right
column of the same row.

The supplier panel prints the letterhead first, then the address, the phone and
email lines, and finally GSTIN/UIN, PAN/IT No. and state. The buyer panel is a
vertical stack rather than two columns: party name, address, phone and email on
one line, then GSTIN/UIN, PAN/IT No. and state on the next. Long values wrap
instead of squeezing the meta grid.

The right-hand grid mirrors the sample of the same type. A sales invoice prints
the full Tally transport grid — Invoice No./Dated, Delivery Note/Mode of
Payment, Supplier's Ref./Other Reference, Buyer's Order No./Dated, Despatch Doc
No./Delivery Note Date, Despatched Through/Terms of Delivery and a full-width
Place of Delivery row — with the due date under it. The purchase sample is a
supplier's shorter Tally form, so a purchase prints Supplier Bill No./Dated,
Voucher No./Place of Supply and Reference No. & Date/Other References.

Tally fields this app does not store (Delivery Note, Mode of Payment, Despatch
Doc No., Delivery Note Date, Despatched Through, Terms of Delivery, Buyer's
Order No.) print as an em dash, exactly as a Tally form leaves them blank.

### Company logo

When `companies.logo` holds a data URL (uploaded from the company page, see
[`16-company-logo.md`](./16-company-logo.md)), a sales invoice prints it as a
letterhead mark beside the company name. It is boxed to a 17mm square with
`object-fit: contain`, so a wide or tall upload keeps its aspect ratio and
cannot change how many line rows fit on the first page. The logo is `alt=""`
because the company name is printed directly next to it. A purchase voucher
reproduces the supplier's bill, and we do not store supplier logos, so that
header has no mark.

### Sales versus purchase

A sales voucher is our own tax invoice. A purchase voucher is the supplier's
tax invoice as received, so the two party blocks swap.

| Field             | Sales                              | Purchase                                    |
| ----------------- | ---------------------------------- | ------------------------------------------- |
| Supplier block    | Our company (logo, terms, bank)    | The supplier (party)                        |
| Buyer block       | The customer                       | Our company                                 |
| Title             | `TAX INVOICE`                      | `TAX INVOICE`                               |
| Number label      | `Invoice No.` (our number)         | `Supplier Bill No.` (reference, or voucher) |
| Voucher number    | `Invoice No.`                      | `Voucher No.`                               |
| Meta grid         | Full Tally transport grid          | Short reference grid from the sample        |
| Due date          | Under the grid                     | Omitted: the supplier's bill has none       |
| Place of delivery | Party shipping or billing address  | Omitted: the buyer block shows our address  |
| Terms and bank    | Company terms, linked bank account | Omitted: supplier terms/bank are not stored |
| Tax columns       | CGST + SGST or IGST                | CGST + SGST or IGST                         |

The supplier bill number is `vouchers.reference_no` (the "Order or bill
reference" field on the purchase form). When it is empty the print falls back
to our own voucher number so the document is never anonymous.

### Tax columns

`isInterStateInvoice` checks whether any line carries IGST. If it does, the grid
shows a single IGST column; otherwise it shows CGST and SGST. The totals block
prints one CGST/SGST pair per rate, so a bill mixing 5% and 18% lines shows four
tax rows. Cess only appears when a line actually has it.

The summary under the totals is HSN/SAC-wise, like the purchase sample:
`buildHsnSummary` groups lines by HSN and rate, sums taxable value and each tax
head, sorts by HSN and prints a total row.

## Where it lives

| Piece                | File                                                            |
| -------------------- | --------------------------------------------------------------- |
| Read model           | `src-tauri/src/vouchers/mod.rs` (`invoice_document`)            |
| Export command       | `src-tauri/src/export/mod.rs` (`export_invoice_pdf`)            |
| Native PDF builder   | `src-tauri/src/export/invoice_pdf.rs`                           |
| Geometry spec        | `src/shared/print-geometry.json`                                |
| Geometry helpers     | `src/shared/print-geometry.ts`                                  |
| Contracts            | `src/shared/contracts/invoice.ts`                               |
| Formatting and slabs | `src/shared/invoice.ts`                                         |
| Amount in words      | `src/shared/amount-in-words.ts`                                 |
| State names          | `src/shared/indian-states.ts`                                   |
| Print route          | `src/renderer/src/features/invoice/pages/InvoicePrintPage.tsx`  |
| One A4 copy          | `src/renderer/src/features/invoice/components/InvoiceSheet.tsx` |
| Print CSS            | `src/renderer/src/features/invoice/invoice-print.css`           |
| Filename builder     | `invoice_pdf::default_filename`                                 |

`vouchers:invoice` returns the invoice read model. It exists because
`VoucherDetail` collapses per-line tax into one number and has no party
address, place of supply or bank block. The read is scoped by company and
returns only SALES and PURCHASE vouchers; any other id is a not-found.

## PDF pipeline

`invoice:exportPdf` receives only the voucher id. The Rust command resolves the
document, builds the filename and opens the native save dialog, so the renderer
never chooses a path and cannot print another company's voucher.

1. The renderer calls `window.api.invoice.exportPdf(id)`.
2. `export_invoice_pdf` checks `VOUCHER_VIEW`, then resolves the read model with
   `vouchers::invoice_document(db, companyId, id)`.
3. `invoice_pdf::default_filename` builds the suggested name.
4. The native save dialog opens. Cancel returns `{ saved: false }` and writes
   nothing.
5. `invoice_pdf::build` returns the PDF bytes. The builder uses `printpdf`
   directly, writes both GST copies, and redraws the frame and table header on
   continuation pages.
6. The file is written, revealed in the file manager, and the command returns
   `{ saved: true, filePath }`.

There is no hidden BrowserWindow and no `printToPDF` step. The React print
route is still available for **Print** and for previewing the same layout in
the webview, but it is not part of the file export path.

### A4 geometry

`src/shared/print-geometry.json` is the single source of page size, margins,
panel widths, table column weights, row/header heights and border weights. The
Rust builder reads it with `include_str!` + `serde_json`; the React sheet
imports the same file. A change to a column weight moves both producers.

The page is A4 (210 × 297 mm). The content margins are 8 mm top, 12 mm left and
right, 6 mm bottom. The sheet frame sits outside the content at 5 mm top and
bottom and 6 mm left and right, so it never doubles a panel edge. Border
classes are `outer` 0.8 pt, `section` 0.5 pt, `cell` 0.4 pt and `total` 0.8 pt.

The native builder draws every box with `rect(x, y, w, h, weight)`, which emits
four continuous edges. Column x positions are computed once from the shared
weights and reused for the header, the body cells and the separator lines. The
description column is left aligned and the numeric columns are flush right
against the same cell edge as their headers. The React sheet mirrors the same
weights and alignments with an inline `<colgroup>`; each cell owns its right and
bottom edge, the first cell owns the left edge, and the header row owns the top
edge, so no edge is drawn twice. On screen the sheet frame is an inset
pseudo-element; in print it becomes a fixed frame that repeats on every page.

A long invoice continues inside the item table. The native builder calls
`continue_page`, which adds a page, redraws the sheet frame, repeats the
document title and caption, and `draw_lines` repeats the table header. The
React sheet uses `thead { display: table-header-group }` and
`break-inside: avoid` on rows.

The print route injects `@page { size: A4; margin: 0 }` only while it is
mounted, so other printable screens keep their own margins. A report page
injects its own `@page` while it is mounted instead (see
[`22-pdf-geometry.md`](./22-pdf-geometry.md)).


## Filename

```
<party-name>_<Sales|Purchase>_<invoice-number>_<yyyyMMdd-HHmmss>.pdf
```

Examples:

```
Acme-Distributors_Sales_INV-0001_20261029-153012.pdf
TechConnect_Purchase_PUR-0001_20261029-154405.pdf
```

Rules (`invoice_pdf::default_filename`):

- The party name comes from the voucher's party snapshot. A cash voucher with
  no party becomes `Party`.
- Sales maps to `Sales`, purchase maps to `Purchase`.
- The voucher number is sanitised: `INV/0001` becomes `INV-0001`.
- The timestamp is local time with second resolution, so two exports in the
  same minute do not collide.
- Windows-reserved characters (`< > : " / \ | ? *`), control characters, runs
  of dashes, and leading or trailing dots, dashes and spaces are removed.
- Each segment is capped at 60 characters and the stem at 150, keeping the full
  path comfortably inside the Windows 260 character limit.
- The builder is pure and unit tested, so the exact name never depends on the
  dialog or the filesystem.

## Limitations

- **Supplier terms and bank details are not stored.** A purchase print
  reproduces the supplier's header, items and tax, but the terms box and bank
  block are omitted because the party master has no such fields. A supplier
  logo is not stored either, so the purchase header has no letterhead mark.
- **Tally transport fields are blank.** Delivery Note, Mode of Payment,
  Despatch Doc No., Delivery Note Date, Despatched Through, Terms of Delivery
  and Buyer's Order No. have no columns in the voucher, so they print an em
  dash. The labels stay so the sheet matches the sample bills.
- **Bank block is thin.** `vouchers.bank_account_id` points at an `accounts`
  row, which has a name and a code but no bank name, IFSC or account number.
  The sheet prints the account name and code when one is linked. A richer bank
  master is a separate schema change.
- **Supplier bill number fallback.** When a purchase voucher has no reference,
  `Supplier Bill No.` falls back to our voucher number. The reference field on
  the purchase form is the right place to record the supplier's number.
- **No per-invoice template editor.** Titles, terms and the bank block come
  from the company record; there is no Tally-style template designer.
- **Long invoices.** The native builder starts a continuation page, redraws
  the frame and repeats the table header. The React sheet lets the item table
  grow past 297 mm, repeats `thead` and keeps each row unbroken. Two copies
  remain two copies, but a very long invoice can span more than one page per
  copy.

## Tests

- `src-tauri/src/export/invoice_pdf.rs` — `rect_edges` emits four continuous
  edges; column positions fill the content width; the table separators are
  unique and never land on the outer edge; `build` returns exactly 2 A4 pages
  for a normal fixture and at least 2 for a 40-line fixture. The tests also
  write `src-tauri/target/test-output/invoice.pdf` and
  `invoice-overflow.pdf` for review.
- `tests/shared/amount-in-words.test.ts` — Indian scales, paise, negatives,
  other currencies and non-finite input.
- `tests/shared/invoice.test.ts` — Indian digit grouping, money and quantity
  formatting, rate-wise slab grouping, HSN grouping by HSN + rate, the shared
  document title, the number labels, the document tax total, inter-state
  detection and state names.
- `tests/renderer/invoice-sheet.test.tsx` — both captions, the `SUPPLIER` and
  `BUYER` panels, the stacked buyer details, the sample item grid, totals,
  amount in words, the HSN/SAC-wise summary, purchase issuer/buyer swap, the
  omitted supplier terms and bank block, the company logo (sales only), the
  cancellation watermark, and the border-ownership class structure of every
  table cell.
- `scripts/smoke-ui.mjs` — boots the built app and checks the print route
  renders both captions. It is a smoke check, not a pixel comparison.
