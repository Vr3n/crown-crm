# 11 — Exports

Every report table and transaction list exports what the user sees. CSV and PDF
were the first two formats; XLSX is the accountant's format because it keeps
numbers and dates typed, so the file can be sorted, totalled and pivoted
without cleaning strings first.

## Formats

| Format | Built in | What it preserves |
| --- | --- | --- |
| CSV | Renderer (`src/renderer/src/lib/export.ts`) | Plain text with a UTF-8 BOM so Excel reads the rupee sign. |
| PDF | Main (`printToPDF` in `src/main/ipc/export.ts`) | The print stylesheet: navigation and toolbars are hidden. |
| XLSX | Main (`src/main/export/xlsx.ts`) | Real cell types, formats, frozen header and column widths. |

The renderer never imports a spreadsheet library and never touches the
filesystem. It sends a table over IPC; the main process builds the workbook and
opens the native save dialog.

## Why ExcelJS

`exceljs@4.4.0` is already a runtime dependency. It is pure JavaScript, has
first-class number formats, frozen panes, fills, borders and auto filters, and
does not need a native add-on.

`write-excel-file` was the lighter alternative. It covers the basics, but this
app needs a styled header, a bold totals row, per-column currency formats and a
frozen first row; doing those there means another dependency plus more custom
code. Keeping ExcelJS also means the packaged app already ships it.

## IPC payload

Channel: `export:xlsx`. Schema: `exportTableSchema` in
`src/shared/contracts/export.ts`.

```ts
{
  filename: 'sales-register',   // used for the save dialog default
  sheetName: 'Sales Register',  // sanitised and capped at 31 chars
  head: ['Date', 'Number', 'Party', 'Total'],
  rows: [['2026-04-01', 'INV/0001', 'Acme', '₹1,234.50']],
  numeric: [3],                 // columns converted to numbers
  dateColumns: [0],             // columns converted to dates
  footer: ['Total', '', '', '₹1,234.50']
}
```

Cells travel as display strings because that is exactly what the on-screen
table already has. `numeric` and `dateColumns` tell the main process which
columns to convert. ISO dates in other columns are also detected, so a register
date never becomes text by accident.

### Conversion rules

- Money accepts the rupee sign, Indian digit grouping, a leading minus and
  accountancy parentheses: `₹1,23,456.78`, `-₹1,200.00`, `(1,200.00)`.
- Dashes, em dashes and words stay text, so an empty money cell does not become
  a misleading zero.
- Dates accept `2026-04-01`, `1 Apr 2026` and `01/04/2026`; impossible dates
  such as `2026-02-31` stay text.
- Money cells use `"₹"#,##0.00`, dates use `dd mmm yyyy`, and the footer row is
  bold with a rule above it.
- Column width is the longest value plus two characters, capped at 48, so a long
  narration cannot push the money columns off the window.

## Security and failure handling

- The save path comes only from the native dialog. The renderer cannot choose a
  path or overwrite a file silently.
- A cancelled dialog resolves `{ saved: false }`; both UI call sites show no
  error for a cancel and a toast only after a real save.
- A rejected channel call becomes the standard IPC error envelope, and the page
  shows `Could not create the spreadsheet`.

## Tests

- `tests/main/export/xlsx.test.ts` reads the generated buffer back with ExcelJS
  and asserts the frozen header, typed money, typed dates, INR format and bold
  footer.
- `tests/e2e/phases-flow.spec.ts` replaces the save dialog in the main process
  with a temp path, clicks XLSX on the sales register, and asserts the file
  exists.
- CSV behaviour stays covered by `tests/renderer/export.test.ts`.
