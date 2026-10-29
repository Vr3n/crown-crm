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
│ [logo] Company name                   TAX INVOICE                │
│ address, city, pincode                ORIGINAL FOR RECIPIENT     │
│ GSTIN · PAN · State · phone · email                              │
├──────────┬──────────┬──────────┬──────────────┬──────────────────┤
│Invoice No│ Date     │ Due Date │ Reference    │ Place of Supply  │
├──────────────────────────────┬───────────────────────────────────┤
│ Bill To / Supplier           │ Ship To                           │
│ name, address, GSTIN, state  │ name, address, GSTIN, state       │
├──┬────────────┬─────┬────┬────┬─────┬──────┬─────┬─────┬────┬────┤
│# │Description │HSN  │Qty │Rate│Disc │Taxbl │GST% │CGST │SGST│Amt │
├──┴────────────┴─────┴────┴────┴─────┴──────┴─────┴─────┴────┴────┤
│ Rate-wise Tax Summary                                            │
├───────────────────────────────────────────┬──────────────────────┤
│ Amount in words                           │ Taxable Value        │
│ Bank details                              │ CGST / SGST / IGST   │
│ Terms & Conditions                        │ Round Off            │
│                                           │ GRAND TOTAL          │
├───────────────────────────────────────────┴──────────────────────┤
│ Subject to <city> jurisdiction              For <company>        │
│                                             Authorised Signatory │
├──────────────────────────────────────────────────────────────────┤
│ ORIGINAL FOR RECIPIENT                              Page 1 of 2  │
└──────────────────────────────────────────────────────────────────┘
```

The second page repeats the same sheet with `DUPLICATE FOR TRANSPORTER`.

### Company logo

When `companies.logo` holds a data URL (uploaded from the company page, see
[`16-company-logo.md`](./16-company-logo.md)), the header prints it as a
letterhead mark beside the company name. It is boxed to an 18mm square with
`object-fit: contain`, so a wide or tall upload keeps its aspect ratio and
cannot change how many line rows fit on the first page. The logo is
`alt=""` because the company name is printed directly next to it. Profiles
without a logo simply render the name block, so the header never leaves a hole.

### Sales versus purchase

| Field        | Sales                    | Purchase                  |
| ------------ | ------------------------ | ------------------------- |
| Title        | `TAX INVOICE`            | `PURCHASE BILL`           |
| Party label  | `Bill To`                | `Supplier`                |
| Number label | `Invoice No.`            | `Supplier Bill No.`       |
| Ship To      | Party's shipping address | The company's own address |
| Tax columns  | CGST + SGST or IGST      | CGST + SGST or IGST       |

The business is the buyer on a purchase voucher, so calling it a "tax invoice"
would be wrong. The rest of the layout is identical; input tax is shown in the
same grid and totals.

### Tax columns

`isInterStateInvoice` checks whether any line carries IGST. If it does, the grid
shows a single IGST column; otherwise it shows CGST and SGST. The rate-wise
summary follows the same rule. Cess only appears when a line actually has it.

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

Each `.invoice-sheet` is `210mm × 297mm` with `box-sizing: border-box` and
12mm side padding. `printToPDF` uses zero margins, so the sheet padding is the
only margin and nothing is doubled. The second sheet starts on a new page
(`break-after: page` on the first, `auto` on the last). Table headers repeat if
an unusually long invoice runs past one page.

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

- **Bank block is thin.** `vouchers.bank_account_id` points at an `accounts`
  row, which has a name and a code but no bank name, IFSC or account number.
  The sheet prints the account name and code when one is linked. A richer bank
  master is a separate schema change.
- **No per-invoice template editor.** Titles, terms and the bank block come
  from the company record; there is no Tally-style template designer.
- **Long invoices.** The sheet grows past 297mm rather than clipping content,
  and the table header repeats. Two copies remain two copies, but a very long
  invoice can span more than one page per copy.

## Tests

- `tests/shared/amount-in-words.test.ts` — Indian scales, paise, negatives,
  other currencies and non-finite input.
- `tests/shared/invoice.test.ts` — Indian digit grouping, money and quantity
  formatting, rate-wise slab grouping, sales/purchase labels, inter-state
  detection and state names.
- `tests/main/export/invoice-filename.test.ts` — exact example filename,
  sanitisation, fallbacks and length caps.
- `tests/renderer/invoice-sheet.test.tsx` — both captions, company and party
  blocks, item grid, totals, amount in words, purchase wording, the company
  logo (rendered when set, absent when not) and the cancellation watermark.
- `tests/e2e/phases-flow.spec.ts` — posts a sales invoice, stubs the native save
  dialog, clicks **Export PDF**, asserts the filename pattern and the `%PDF`
  header, then opens the print route and asserts both captions.
