import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

/**
 * Build a workbook from the two sample bills in `docs/`.
 *
 * Each sheet keeps the bill's header block, then flattens the item grid into
 * the one-row-per-line shape an importer needs. The Amount, CGST, SGST and
 * Total columns are kept for reference; the importer recomputes them.
 */

const PURCHASE_HEADER = [
  'Supplier Bill No',
  'Bill Date',
  'Supplier',
  'Supplier GSTIN',
  'Sl No',
  'Description of Goods',
  'HSN/SAC',
  'Quantity',
  'per',
  'Rate',
  'Disc. %',
  'GST %',
  'Amount',
  'Place of Supply'
]

const PURCHASE_LINES = [
  ['Epson Ink 003 Black', '3215', 1, 340.0, 15.254, 288.14],
  ['Epson Ink 003 Cyan', '3215', 1, 485.0, 15.254, 411.02],
  ['Epson Ink 003 Magenda', '3215', 1, 485.0, 15.254, 411.02],
  ['Epson Ink 003 Yellow', '3215', 1, 485.0, 15.254, 411.02],
  ['Artis Laptop Adapter', '8504', 2, 450.0, 15.254, 762.71],
  ['18.5" LG LED MONITER', '8528', 1, 5150.0, 15.254, 4364.42],
  ['Intel Core I5(3rd)', '84733010', 1, 1075.0, 0, 1075.0],
  ['8gb Ddr4 Ram SKHYNIX', '8473', 1, 3150.0, 0, 3150.0],
  ['Tp-Link Router C6', '8517', 1, 2300.0, 0, 2300.0]
]

const purchaseRows = [
  ['TAX INVOICE', null, null, null, null, null, null, null, null, null, null, null, null, null],
  [
    'TECHCONNECT INFORMATIQUE',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'OFF: SHOP NO.6, DIXIT NIWAS, MORE BANGLOW, OPP WOODLAND THEATRE, VIRAR(W)',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'GSTIN/UIN: 27CRBPJ7020H1Z0     State: Maharashtra, Code: 27',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Buyer (Bill to): Acme Corp, E-20 4, Acme Nagar CHS LTD, Phone: 1234567890',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Invoice No.: TC/2026-27/583     Dated: 13-Jul-26',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Place of Supply: 27     Supplier GSTIN: 27CRBPJ7020H1Z0',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [],
  PURCHASE_HEADER,
  ...PURCHASE_LINES.map((line, index) => [
    'TC/2026-27/583',
    '13-Jul-26',
    'TECHCONNECT INFORMATIQUE',
    '27CRBPJ7020H1Z0',
    index + 1,
    line[0],
    line[1],
    line[2],
    'pcs',
    line[3],
    line[4],
    18,
    line[5],
    27
  ]),
  ['Total', null, null, null, null, null, null, 10, null, null, null, null, 13173.33, null],
  ['CGST @ 9%', null, null, null, null, null, null, null, null, null, null, null, 1185.59, null],
  ['SGST @ 9%', null, null, null, null, null, null, null, null, null, null, null, 1185.59, null],
  ['Round Off', null, null, null, null, null, null, null, null, null, null, null, 0.49, null],
  ['Total', null, null, null, null, null, null, 10, null, null, null, null, 15545.0, null]
]

const salesRows = [
  [
    "Tax Invoice - Original - Buyers' Copy",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  ['Acme Corp', null, null, null, null, null, null, null, null, null, null, null, null, null],
  [
    'E-204, Acme Org CHS LTD, Acme Nagar Phase - I, PH (West), Tal-AA, Dist. CB, Pin - 121331',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'GST/UIN NO: 27AABFU4477G1ZY     State Code: 27',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Buyer: Acme DISTRIBUTOR, At Gurade, Near Acme Talao, Acme Road, Philadelphia (West), Mob- 1234567890',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Invoice No.: 84/2026-27     Dated: 11.09.2026',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [
    'Place of Supply: 27     Customer GSTIN:',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],
  [],
  [
    'Invoice No',
    'Invoice Date',
    'Customer',
    'Customer GSTIN',
    'Sl No',
    'Description of Goods',
    'HSN/SAC',
    'Quantity',
    'per',
    'Rate',
    'Disc. %',
    'GST %',
    'Amount',
    'Place of Supply'
  ],
  [
    '84/2026-27',
    '11.09.2026',
    'Acme DISTRIBUTOR',
    null,
    1,
    'EVM 256GB SATA SSD',
    '8523',
    1,
    'pcs',
    3855.93,
    0,
    18,
    3855.93,
    27
  ],
  ['Total', null, null, null, null, null, null, 1, null, null, null, null, 3855.93, null],
  ['CGST @ 9%', null, null, null, null, null, null, null, null, null, null, null, 347.03, null],
  ['SGST @ 9%', null, null, null, null, null, null, null, null, null, null, null, 347.03, null],
  ['Total', null, null, null, null, null, null, 1, null, null, null, null, 4550.0, null]
]

function makeSheet(rows, widths) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = widths.map((wch) => ({ wch }))
  sheet['!merges'] = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        row[0] && !PURCHASE_HEADER.includes(row[0]) && !String(row[0]).startsWith('Total')
    )
    .slice(0, 7)
    .map(({ index }) => ({ s: { r: index, c: 0 }, e: { r: index, c: 13 } }))
  for (let row = 9; row < rows.length; row += 1) {
    if (!rows[row] || !rows[row][0]) continue
    const first = String(rows[row][0])
    if (
      first.startsWith('Total') ||
      first.startsWith('CGST') ||
      first.startsWith('SGST') ||
      first.startsWith('Round')
    ) {
      continue
    }
    for (const col of [9, 12]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })]
      if (cell && typeof cell.v === 'number') cell.z = '#,##0.00'
    }
  }
  return sheet
}

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  workbook,
  makeSheet(purchaseRows, [18, 12, 24, 20, 6, 26, 12, 9, 6, 10, 8, 7, 11, 14]),
  'Purchase bills'
)
XLSX.utils.book_append_sheet(
  workbook,
  makeSheet(salesRows, [16, 13, 20, 18, 6, 24, 12, 9, 6, 10, 8, 7, 11, 14]),
  'Sales bill'
)

const output = fileURLToPath(new URL('../docs/guides/sample-bills-from-pdfs.xlsx', import.meta.url))
const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
writeFileSync(output, data)
console.log(output)
