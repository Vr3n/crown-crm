import type { CellValue, SheetData, WorkbookData } from '@shared/excel-import/types'

function sheet(name: string, rows: CellValue[][]): SheetData {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0)
  const padded = rows.map((row) => {
    const next = [...row]
    while (next.length < width) next.push(null)
    return next
  })
  return { name, rows: padded, rowCount: padded.length, colCount: width }
}

/**
 * A workbook that looks like one a trader would actually send.
 *
 * The purchase sheet has a title block above the header and a totals row below
 * the data, so the range step has something real to solve. The sales sheet has
 * an unmatched customer and a free-text service line. The third sheet is a
 * reference list that is not part of the import.
 */
export function sampleWorkbook(): WorkbookData {
  return {
    fileName: 'Crown-Books-sample.xlsx',
    sheets: [
      sheet('Purchases Apr-Jun', [
        [
          'Crown Books',
          null,
          'Purchase register',
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
        ['April to June 2026', null, null, null, null, null, null, null, null, null, null, null],
        [],
        [
          'Supplier Bill No',
          'Bill Date',
          'Supplier',
          'Supplier GSTIN',
          'Item',
          'HSN',
          'Qty',
          'Unit',
          'Rate',
          'Disc %',
          'GST %',
          'Place of Supply'
        ],
        [
          'SH-1042',
          '05-04-2026',
          'Sharma Traders',
          '27AABCS1234C1Z5',
          'SSD 256GB',
          '8523',
          2,
          'Nos',
          3855.93,
          0,
          18,
          '27'
        ],
        [
          'SH-1042',
          '05-04-2026',
          'Sharma Traders',
          '27AABCS1234C1Z5',
          'USB-C Cable',
          '8544',
          5,
          'Nos',
          450,
          0,
          18,
          '27'
        ],
        [
          'SH-1042',
          '05-04-2026',
          'Sharma Traders',
          '27AABCS1234C1Z5',
          'Keyboard',
          '8471',
          2,
          'Nos',
          1250,
          5,
          18,
          '27'
        ],
        [
          'PT-778',
          '12-04-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'Monitor 24 inch',
          '8528',
          1,
          'Nos',
          12000,
          0,
          18,
          '27'
        ],
        [
          'PT-778',
          '12-04-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'Monitor Stand',
          '8302',
          1,
          'Nos',
          1800,
          0,
          18,
          '27'
        ],
        [
          'KD-311',
          '20-04-2026',
          'Krishna Distributors',
          '27AAACK9012E1Z9',
          'Office Chair',
          '9401',
          4,
          'Nos',
          5200,
          10,
          18,
          '27'
        ],
        [
          'NS-900',
          '28-04-2026',
          'New Supplier Co',
          null,
          'Thermal Paper Roll',
          '4823',
          20,
          'Box',
          320,
          0,
          12,
          '27'
        ],
        [
          'SH-1043',
          '03-05-2026',
          'Sharma Traders',
          '27AABCS1234C1Z5',
          'SSD 256GB',
          '8523',
          4,
          'Nos',
          3900,
          0,
          18,
          '27'
        ],
        [
          'PT-779',
          '09-05-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'HDMI Cable',
          '8544',
          10,
          'Nos',
          650,
          0,
          18,
          '27'
        ],
        [
          'KD-312',
          '17-05-2026',
          'Krishna Distributors',
          '27AAACK9012E1Z9',
          'Desk Lamp',
          '9405',
          6,
          'Nos',
          950,
          0,
          18,
          '27'
        ],
        [
          'NS-901',
          '24-05-2026',
          'New Supplier Co',
          null,
          'Thermal Paper Roll',
          '4823',
          30,
          'Box',
          315,
          0,
          12,
          '27'
        ],
        ['Total', null, null, null, null, null, 84, null, null, null, null, null],
        [],
        ['Prepared by Priya. Rates are exclusive of GST.']
      ]),
      sheet('Sales May', [
        [
          'Invoice No',
          'Invoice Date',
          'Customer',
          'Customer GSTIN',
          'Item',
          'HSN',
          'Qty',
          'Unit',
          'Rate',
          'Discount %',
          'GST %',
          'Place of Supply'
        ],
        [
          'INV-201',
          '02-05-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'Monitor 24 inch',
          '8528',
          1,
          'Nos',
          12000,
          5,
          18,
          '27'
        ],
        [
          'INV-201',
          '02-05-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'Monitor Stand',
          '8302',
          1,
          'Nos',
          1800,
          0,
          18,
          '27'
        ],
        [
          'INV-201',
          '02-05-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'Installation Service',
          '9987',
          1,
          'Nos',
          500,
          0,
          18,
          '27'
        ],
        [
          'INV-202',
          '04-05-2026',
          'Gupta Stores',
          null,
          'SSD 256GB',
          '8523',
          2,
          'Nos',
          4200,
          0,
          18,
          '27'
        ],
        [
          'INV-203',
          '07-05-2026',
          'Sharma Traders',
          '27AABCS1234C1Z5',
          'Keyboard',
          '8471',
          3,
          'Nos',
          1450,
          0,
          18,
          '27'
        ],
        [
          'INV-204',
          '11-05-2026',
          'Patel Electronics',
          '27AAACP5678D1Z2',
          'USB-C Cable',
          '8544',
          8,
          'Nos',
          520,
          0,
          18,
          '27'
        ],
        [
          'INV-205',
          '15-05-2026',
          'Krishna Distributors',
          '27AAACK9012E1Z9',
          'Desk Lamp',
          '9405',
          4,
          'Nos',
          1150,
          0,
          18,
          '27'
        ],
        [
          'INV-206',
          '21-05-2026',
          'Gupta Stores',
          null,
          'Thermal Paper Roll',
          '4823',
          10,
          'Box',
          380,
          0,
          12,
          '27'
        ],
        [
          'INV-207',
          '28-05-2026',
          'Walk-in Customer',
          null,
          'HDMI Cable',
          '8544',
          2,
          'Nos',
          750,
          0,
          18,
          '27'
        ],
        ['Total', null, null, null, null, null, 30, null, null, null, null, null],
        [],
        ['Exported from BillDesk on 01-06-2026.']
      ]),
      sheet('Party list', [
        ['Name', 'GSTIN', 'Type', 'Phone'],
        ['Sharma Traders', '27AABCS1234C1Z5', 'Supplier', '98200 11223'],
        ['Patel Electronics', '27AAACP5678D1Z2', 'Customer and Supplier', '98200 44556'],
        ['Krishna Distributors', '27AAACK9012E1Z9', 'Supplier', '98200 77889'],
        ['Gupta Stores', null, 'Customer', '98200 33445']
      ])
    ]
  }
}
