import type { FieldDef, FieldKey, ImportTarget } from './types'

/**
 * The fields the importer can fill, in the order they appear on screen.
 *
 * Required means the books cannot accept the row without it. A recommended
 * field is one the flow works better with, and the review step warns when it is
 * missing instead of blocking.
 */
const BILL_FIELDS: Record<ImportTarget, FieldDef[]> = {
  PURCHASE: [
    {
      key: 'billNo',
      label: 'Supplier bill no.',
      group: 'bill',
      required: false,
      help: 'The number printed on the supplier bill. Rows with the same number become one purchase bill.',
      aliases: [
        'supplier bill no',
        'supplier bill number',
        'supplier invoice no',
        'supplier invoice number',
        'purchase bill no',
        'bill no',
        'bill number',
        'invoice no',
        'invoice number',
        'inv no',
        'voucher no',
        'billno'
      ],
      example: 'SH-1042'
    },
    {
      key: 'date',
      label: 'Bill date',
      group: 'bill',
      required: true,
      help: 'The date on the supplier bill. This decides the financial year and the due date.',
      aliases: ['bill date', 'purchase date', 'invoice date', 'date', 'dt', 'bill dt'],
      example: '05-04-2026'
    },
    {
      key: 'party',
      label: 'Supplier',
      group: 'bill',
      required: true,
      help: 'Who the bill is from. We match it to your parties by GSTIN, then by name.',
      aliases: [
        'supplier',
        'supplier name',
        'vendor',
        'vendor name',
        'party',
        'party name',
        'seller',
        'seller name',
        'firm name',
        'company'
      ],
      example: 'Sharma Traders'
    },
    {
      key: 'partyGstin',
      label: 'Supplier GSTIN',
      group: 'bill',
      required: false,
      help: 'Used to match the supplier and to decide CGST + SGST versus IGST.',
      aliases: [
        'gstin',
        'supplier gstin',
        'vendor gstin',
        'gst no',
        'gst number',
        'gstin no',
        'tax id'
      ],
      example: '27AABCS1234C1Z5'
    },
    {
      key: 'dueDate',
      label: 'Due date',
      group: 'bill',
      required: false,
      help: 'When the bill is payable. Left blank, it follows the supplier credit days.',
      aliases: ['due date', 'payment due', 'due dt', 'pay by'],
      example: '05-05-2026'
    },
    {
      key: 'placeOfSupply',
      label: 'Place of supply',
      group: 'bill',
      required: false,
      help: 'The two digit state code. It decides whether the tax is CGST + SGST or IGST.',
      aliases: ['place of supply', 'pos', 'state code', 'supply state', 'state'],
      example: '27'
    },
    {
      key: 'narration',
      label: 'Narration',
      group: 'bill',
      required: false,
      help: 'Any note printed with the bill, such as the purchase order number.',
      aliases: ['narration', 'remarks', 'notes', 'note', 'comment', 'comments'],
      example: 'PO-118'
    }
  ],
  SALES: [
    {
      key: 'billNo',
      label: 'Invoice no.',
      group: 'bill',
      required: false,
      help: 'Your invoice number. Rows with the same number become one sales invoice, and the number is kept as the reference.',
      aliases: [
        'invoice no',
        'invoice number',
        'sales invoice no',
        'sales invoice number',
        'bill no',
        'bill number',
        'voucher no',
        'inv no',
        'invoice'
      ],
      example: 'INV-201'
    },
    {
      key: 'date',
      label: 'Invoice date',
      group: 'bill',
      required: true,
      help: 'The date on the invoice. This decides the financial year and the due date.',
      aliases: ['invoice date', 'bill date', 'sale date', 'sales date', 'date', 'dt'],
      example: '02-05-2026'
    },
    {
      key: 'party',
      label: 'Customer',
      group: 'bill',
      required: true,
      help: 'Who the invoice is for. We match it to your parties by GSTIN, then by name.',
      aliases: [
        'customer',
        'customer name',
        'buyer',
        'buyer name',
        'party',
        'party name',
        'client',
        'client name',
        'account name'
      ],
      example: 'Patel Electronics'
    },
    {
      key: 'partyGstin',
      label: 'Customer GSTIN',
      group: 'bill',
      required: false,
      help: 'Used to match the customer and to decide CGST + SGST versus IGST.',
      aliases: ['gstin', 'customer gstin', 'buyer gstin', 'gst no', 'gst number', 'gstin no'],
      example: '27AAACP5678D1Z2'
    },
    {
      key: 'dueDate',
      label: 'Due date',
      group: 'bill',
      required: false,
      help: 'When the invoice is due. Left blank, it follows the customer credit days.',
      aliases: ['due date', 'payment due', 'due dt', 'pay by'],
      example: '01-06-2026'
    },
    {
      key: 'placeOfSupply',
      label: 'Place of supply',
      group: 'bill',
      required: false,
      help: 'The two digit state code. It decides whether the tax is CGST + SGST or IGST.',
      aliases: ['place of supply', 'pos', 'state code', 'supply state', 'state'],
      example: '27'
    },
    {
      key: 'narration',
      label: 'Narration',
      group: 'bill',
      required: false,
      help: 'Any note printed with the invoice.',
      aliases: ['narration', 'remarks', 'notes', 'note', 'comment', 'comments'],
      example: 'Delivered to Pune'
    }
  ]
}

const LINE_FIELDS: FieldDef[] = [
  {
    key: 'item',
    label: 'Item',
    group: 'line',
    required: false,
    help: 'The item in your item master. Unmatched text still posts as a free-text line. Item or Description is required.',
    aliases: [
      'item',
      'item name',
      'product',
      'product name',
      'stock item',
      'item code',
      'sku',
      'particulars',
      'description'
    ],
    example: 'SSD 256GB'
  },
  {
    key: 'description',
    label: 'Description',
    group: 'line',
    required: false,
    help: 'What is printed on the bill. Left blank, the item name is used. Item or Description is required.',
    aliases: ['description', 'item description', 'product description', 'details', 'particulars'],
    example: 'SSD 256GB'
  },
  {
    key: 'hsn',
    label: 'HSN / SAC',
    group: 'line',
    required: false,
    help: 'The tax classification printed on the bill.',
    aliases: ['hsn', 'hsn sac', 'hsn code', 'sac', 'hsn/sac', 'hsn code no'],
    example: '8523'
  },
  {
    key: 'qty',
    label: 'Quantity',
    group: 'line',
    required: true,
    help: 'How many were bought or sold. Up to four decimals.',
    aliases: ['qty', 'quantity', 'qty.', 'billed qty', 'purchased qty', 'sold qty', 'nos'],
    example: '2'
  },
  {
    key: 'uom',
    label: 'Unit',
    group: 'line',
    required: false,
    help: 'Nos, Kg, Box, and so on. It is printed on the bill.',
    aliases: ['unit', 'uom', 'per', 'measure', 'unit of measure'],
    example: 'Nos'
  },
  {
    key: 'rate',
    label: 'Rate',
    group: 'line',
    required: true,
    help: 'The price for one unit. Tax is added on top unless "Prices include GST" is on.',
    aliases: [
      'rate',
      'price',
      'unit price',
      'purchase rate',
      'sale rate',
      'cost',
      'rate per unit',
      'price per unit'
    ],
    example: '3855.93'
  },
  {
    key: 'discount',
    label: 'Discount %',
    group: 'line',
    required: false,
    help: 'A percentage off the line. Leave blank for no discount.',
    aliases: ['discount', 'disc', 'discount %', 'disc %', 'discount percent', 'discount rate'],
    example: '0'
  },
  {
    key: 'gst',
    label: 'GST %',
    group: 'line',
    required: false,
    help: 'The GST rate on this line. Leave the column unmapped only if every line is 0%.',
    aliases: [
      'gst',
      'gst %',
      'gst rate',
      'tax',
      'tax %',
      'tax rate',
      'igst',
      'igst %',
      'tax percent'
    ],
    example: '18'
  }
]

export function fieldsFor(target: ImportTarget): FieldDef[] {
  return [...BILL_FIELDS[target], ...LINE_FIELDS]
}

export function fieldDef(target: ImportTarget, key: FieldKey): FieldDef {
  const found = fieldsFor(target).find((field) => field.key === key)
  if (!found) throw new Error(`Unknown import field: ${key}`)
  return found
}

export function requiredFields(target: ImportTarget): FieldKey[] {
  return fieldsFor(target)
    .filter((field) => field.required)
    .map((field) => field.key)
}

/** Fields the flow works better with, but which do not block an import. */
export function recommendedFields(target: ImportTarget): FieldKey[] {
  return fieldsFor(target)
    .filter((field) => !field.required && field.key === 'billNo')
    .map((field) => field.key)
}

export function isRequired(target: ImportTarget, key: FieldKey): boolean {
  return fieldDef(target, key).required
}
