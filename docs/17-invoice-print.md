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
- Electron `webContents.printToPDF` — <https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions>
- `PrintToPDFOptions` — <https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options>

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
│ TAX INVOICE                              ORIGINAL FOR RECIPIENT │
├───────────────────────────────────────┬──────────────────────────┤
│ [logo] Company / supplier name        │ Invoice No.  │ Dated     │
│ address, city, pincode                │ Delivery Note│ Mode of   │
│ GSTIN/UIN · PAN/IT No. · State        │ Supplier's   │ Payment   │
│ phone · email                         │   Ref.       │ Other Ref.│
│                                       │ ... Tally transport grid │
│                                       │ Place of Delivery        │
├───────────────────────────────────────┴──────────────────────────┤
│ BUYER (BILL TO)                                                  │
│ name, address                      Phone · GSTIN/UIN · PAN/IT No.│
│                                    State Name · Contact          │
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
`docs/purchase-bill.pdf`: the issuer block and Tally meta grid at the top, a
buyer block with phone/GSTIN/PAN/state, the S.No/Description/HSN/Quantity/
Rate/per/Disc./Amount grid, totals with a CGST/SGST or IGST row per rate,
amount in words, the HSN/SAC-wise tax summary, tax in words, terms, a
declaration and the signature block.

The right-hand grid mirrors the sample of the same type. A sales invoice prints
the full Tally transport grid — Invoice No./Dated, Delivery Note/Mode of
Payment, Supplier's Ref./Other Reference, Buyer's Order No./Dated, Despatch Doc
No./Delivery Note Date, Despatched Through/Terms of Delivery and a full-width
Place of Delivery row — with the due date under it. The purchase sample is a
supplier's shorter Tally form, so a purchase prints Supplier Bill No./Dated, Our
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
| Issuer block      | Our company (logo, terms, bank)    | The supplier (party)                        |
| Buyer block       | The customer                       | Our company                                 |
| Title             | `TAX INVOICE`                      | `TAX INVOICE`                               |
| Number label      | `Invoice No.` (our number)         | `Supplier Bill No.` (reference, or voucher) |
| Voucher number    | `Invoice No.`                      | `Our Voucher No.`                           |
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
| Read model           | `src/main/repositories/invoice.ts`                              |
| Application lookup   | `src/main/application/invoice.ts`                               |
| IPC                  | `src/main/ipc/invoice.ts`                                       |
| Contracts            | `src/shared/contracts/invoice.ts`                               |
| Formatting and slabs | `src/shared/invoice.ts`                                         |
| Amount in words      | `src/shared/amount-in-words.ts`                                 |
| State names          | `src/shared/indian-states.ts`                                   |
| Print route          | `src/renderer/src/features/invoice/pages/InvoicePrintPage.tsx`  |
| One A4 copy          | `src/renderer/src/features/invoice/components/InvoiceSheet.tsx` |
| Print CSS            | `src/renderer/src/features/invoice/invoice-print.css`           |
| PDF pipeline         | `src/main/export/invoice-pdf.ts`                                |
| Filename builder     | `src/main/export/invoice-filename.ts`                           |

`vouchers:invoice` returns the invoice read model. It exists because
`VoucherDetail` collapses per-line tax into one number and has no party
address, place of supply or bank block. The read is scoped by company and
returns only SALES and PURCHASE vouchers; any other id is a not-found.

## PDF pipeline

`invoice:exportPdf` receives only the voucher id. The main process resolves the
document, builds the filename and opens the save dialog, so the renderer never
chooses a path and cannot print another company's voucher.

1. A hidden `BrowserWindow` loads `#/print/vouchers/:id` (dev server in
   development, `loadFile(..., { hash })` in the packaged app).
2. The window waits for `did-finish-load` (and rejects on `did-fail-load`).
3. The renderer resolves the query, waits for `document.fonts.ready` and every
   image's `decode()`, then sets `window.__invoicePrintState = { ready: true }`.
   It stays `undefined` while the query is in flight, so the main process can
   never print a skeleton.
4. The main process polls that flag with a 20 second render timeout, then calls
   `printToPDF({ printBackground: true, pageSize: 'A4', margins: 0,
preferCSSPageSize: true })`.
5. The native save dialog opens with the generated filename. Cancel resolves
   `{ saved: false }` and writes nothing. A successful write reveals the file
   and resolves `{ saved: true, filePath }`.
6. The window is destroyed in `finally`, whether printing succeeded, failed or
   the user cancelled.

The print page injects `@page { size: A4; margin: 0 }` only while it is
mounted. Putting that rule in the stylesheet would change the margins of every
other printable screen.

### A4 geometry

Each `.invoice-sheet` is `210mm × 297mm` with `box-sizing: border-box`, 12mm
side padding, 8mm at the top and 6mm at the bottom. `printToPDF` uses zero
margins, so the sheet padding is the only margin and nothing is doubled. The
item table lives in a grid track that takes the remaining height and its rows
stretch, so a one-line invoice fills the page instead of leaving a white gap;
a long invoice grows past 297mm. The second sheet starts on a new page
(`break-after: page` on the first, `auto` on the last), and table headers repeat
if an invoice runs past one page.

## Filename

```
<party-name>_<Sales|Purchase>_<invoice-number>_<yyyyMMdd-HHmmss>.pdf
```

Examples:

```
Acme-Distributors_Sales_INV-0001_20261029-153012.pdf
TechConnect_Purchase_PUR-0001_20261029-154405.pdf
```

Rules (`src/main/export/invoice-filename.ts`):

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
- **Long invoices.** The sheet grows past 297mm rather than clipping content,
  and the table header repeats. Two copies remain two copies, but a very long
  invoice can span more than one page per copy.

## Tests

- `tests/shared/amount-in-words.test.ts` — Indian scales, paise, negatives,
  other currencies and non-finite input.
- `tests/shared/invoice.test.ts` — Indian digit grouping, money and quantity
  formatting, rate-wise slab grouping, HSN grouping by HSN + rate, the shared
  document title, the number labels, the document tax total, inter-state
  detection and state names.
- `tests/main/export/invoice-filename.test.ts` — exact example filename,
  sanitisation, fallbacks and length caps.
- `tests/renderer/invoice-sheet.test.tsx` — both captions, the sales issuer and
  buyer blocks, the sample item grid, totals, amount in words, the HSN/SAC-wise
  summary, purchase issuer/buyer swap, the omitted supplier terms and bank
  block, the company logo (sales only) and the cancellation watermark.
- `tests/e2e/phases-flow.spec.ts` — posts a sales invoice, stubs the native save
  dialog, clicks **Export PDF**, asserts the filename pattern and the `%PDF`
  header, then opens the print route and asserts both captions.
