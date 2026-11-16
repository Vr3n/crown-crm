import { beforeAll, describe, expect, it } from 'vitest'
import {
  autoMap,
  missingRequiredFields,
  mappingIsComplete
} from '../../src/shared/excel-import/automap'
import { detectHeaderRow, suggestTableRange } from '../../src/shared/excel-import/parse'
import { buildPlan, buildVoucherInput, requestIdFor } from '../../src/shared/excel-import/plan'
import {
  normalizePartyName,
  parseDateCell,
  parseMoneyMinor,
  parseNumberCell,
  parsePercentCell,
  parseQuantityE4,
  rangeAddress
} from '../../src/shared/excel-import/parse'
import { DEFAULT_OPTIONS } from '../../src/shared/excel-import/types'
import type {
  CellValue,
  ImportOptions,
  ImportPlan,
  ImportTarget,
  PartyResolutionMap,
  SheetData
} from '../../src/shared/excel-import/types'
import { createDemoRuntime } from '../../src/renderer/src/features/imports/lib/demo-runtime'
import { sampleWorkbook } from '../../src/renderer/src/features/imports/lib/sample-workbook'
import type { ItemRow, PartyRow } from '../../src/shared/contracts/masters'

let parties: PartyRow[] = []
let items: ItemRow[] = []

beforeAll(async () => {
  const runtime = createDemoRuntime()
  parties = await runtime.listParties()
  items = await runtime.listItems()
})

function sheetNamed(name: string): SheetData {
  const sheet = sampleWorkbook().sheets.find((row) => row.name === name)
  if (!sheet) throw new Error(`Missing sample sheet ${name}`)
  return sheet
}

function planFor(
  sheet: SheetData,
  target: ImportTarget,
  options: Partial<ImportOptions> = {},
  partyResolutions: PartyResolutionMap = {}
): ImportPlan {
  const range = suggestTableRange(sheet.rows, sheet.name, target)
  const headerRow = detectHeaderRow(sheet.rows, range, target)
  const mapping = autoMap(sheet.rows, headerRow, range.startCol, range.endCol, target)
  return buildPlan({
    target,
    rows: sheet.rows,
    range,
    headerRow,
    mapping,
    options: { ...DEFAULT_OPTIONS, ...options },
    parties,
    items,
    partyResolutions,
    companyStateCode: '27',
    roundOffMode: 'INVOICE'
  })
}

describe('cell parsing', () => {
  it('reads the date formats an Indian workbook actually contains', () => {
    expect(parseDateCell('05-04-2026')).toBe('2026-04-05')
    expect(parseDateCell('05/04/2026')).toBe('2026-04-05')
    expect(parseDateCell('2026-04-05')).toBe('2026-04-05')
    expect(parseDateCell('5 Apr 2026')).toBe('2026-04-05')
    expect(parseDateCell(46_117)).toBe('2026-04-05')
    expect(parseDateCell(new Date(2026, 3, 5))).toBe('2026-04-05')
    expect(parseDateCell('32-13-2026')).toBeNull()
    expect(parseDateCell('')).toBeNull()
  })

  it('reads money, quantity and percentages', () => {
    expect(parseNumberCell('1,23,456.78')).toBe(123_456.78)
    expect(parseNumberCell('₹ 3,855.93')).toBe(3855.93)
    expect(parseMoneyMinor('3,855.93')).toBe(385_593)
    expect(parseQuantityE4('1.2345')).toBe(12_345)
    expect(parsePercentCell(0.18)).toBe(1800)
    expect(parsePercentCell(18)).toBe(1800)
    expect(parsePercentCell('18%')).toBe(1800)
    expect(parsePercentCell('0.5%')).toBe(50)
    expect(parsePercentCell('0.18')).toBe(1800)
  })

  it('normalises a party name without its legal suffix', () => {
    expect(normalizePartyName('M/s Sharma Traders Pvt. Ltd.')).toBe('sharma traders')
    expect(normalizePartyName('Patel Electronics & Co')).toBe('patel electronics and')
  })

  it('formats a range address', () => {
    expect(rangeAddress({ sheet: 'S', startRow: 3, startCol: 0, endRow: 14, endCol: 11 })).toBe(
      'A4:L15'
    )
  })
})

describe('finding the table in a real sheet', () => {
  it('skips the title block and stops at the totals row', () => {
    const sheet = sheetNamed('Purchases Apr-Jun')
    const range = suggestTableRange(sheet.rows, sheet.name, 'PURCHASE')
    expect(range.startRow).toBe(3)
    expect(range.endRow).toBe(14)
    expect(range.startCol).toBe(0)
    expect(range.endCol).toBe(11)
    expect(detectHeaderRow(sheet.rows, range, 'PURCHASE')).toBe(3)
  })

  it('prefers the item master over a free-text particulars column', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Particulars', 'Qty', 'Rate', 'GST %'],
      ['A-1', '05-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 100, 18]
    ]
    const mapping = autoMap(rows, 0, 0, 6, 'PURCHASE')
    expect(mapping.item).toBe(3)
    expect(mapping.description).toBeUndefined()
  })

  it('keeps scanning past one blank row between two blocks', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate'],
      ['A-1', '05-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 100],
      [],
      ['A-2', '06-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 100]
    ]
    const range = suggestTableRange(rows, 'Blocks', 'PURCHASE')
    expect(range.startRow).toBe(0)
    expect(range.endRow).toBe(3)
  })

  it('stops at a totals row even when its first cell is blank', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate'],
      ['A-1', '05-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 100],
      [null, 'Total', null, null, 1, 100]
    ]
    const range = suggestTableRange(rows, 'Totals', 'PURCHASE')
    expect(range.endRow).toBe(1)
  })

  it('maps every purchase column from its header', () => {
    const sheet = sheetNamed('Purchases Apr-Jun')
    const range = suggestTableRange(sheet.rows, sheet.name, 'PURCHASE')
    const headerRow = detectHeaderRow(sheet.rows, range, 'PURCHASE')
    const mapping = autoMap(sheet.rows, headerRow, range.startCol, range.endCol, 'PURCHASE')
    expect(mapping.billNo).toBe(0)
    expect(mapping.date).toBe(1)
    expect(mapping.party).toBe(2)
    expect(mapping.partyGstin).toBe(3)
    expect(mapping.item).toBe(4)
    expect(mapping.hsn).toBe(5)
    expect(mapping.qty).toBe(6)
    expect(mapping.uom).toBe(7)
    expect(mapping.rate).toBe(8)
    expect(mapping.discount).toBe(9)
    expect(mapping.gst).toBe(10)
    expect(mapping.placeOfSupply).toBe(11)
    expect(missingRequiredFields('PURCHASE', mapping)).toEqual([])
    expect(mappingIsComplete('PURCHASE', mapping)).toBe(true)
  })
})

describe('building a purchase plan', () => {
  it('groups lines by supplier bill number and totals them like the server', () => {
    const plan = planFor(sheetNamed('Purchases Apr-Jun'), 'PURCHASE')
    expect(plan.stats.bills).toBe(8)
    expect(plan.stats.lines).toBe(11)
    expect(plan.stats.errors).toBe(0)
    expect(plan.stats.newParties).toBe(1)
    expect(plan.canImport).toBe(true)

    const bill = plan.bills.find((row) => row.billNo === 'SH-1042')
    expect(bill?.lines).toHaveLength(3)
    expect(bill?.taxableMinor).toBe(1_233_686)
    expect((bill?.cgstMinor ?? 0) + (bill?.sgstMinor ?? 0)).toBe(222_064)
    expect(bill?.lines[0].cgstMinor).toBe(69_407)
    expect(bill?.lines[0].sgstMinor).toBe(69_407)
    expect(bill?.roundOffMinor).toBe(50)
    expect(bill?.totalMinor).toBe(1_455_800)
    expect(bill?.partyAction).toBe('matched')
    expect(bill?.partyId).toBe(1)
    expect(bill?.dueDate).toBe('2026-05-05')
  })

  it('keeps a long bill key inside the idempotency limit without collisions', () => {
    const session = '12345678-1234-1234-1234-123456789012'
    const first = requestIdFor(session, `bill:${'A'.repeat(80)}1`)
    const second = requestIdFor(session, `bill:${'A'.repeat(80)}2`)
    expect(first.length).toBeLessThanOrEqual(80)
    expect(first).not.toBe(second)
  })

  it('builds the exact post payload for a grouped bill', () => {
    const plan = planFor(sheetNamed('Purchases Apr-Jun'), 'PURCHASE')
    const bill = plan.bills.find((row) => row.billNo === 'SH-1042')
    if (!bill) throw new Error('Missing SH-1042')
    const input = buildVoucherInput(plan, bill, 'session:bill:sh-1042', 1, {})
    expect(input.type).toBe('PURCHASE')
    expect(input.supplierBillNo).toBe('SH-1042')
    expect(input.supplierBillMissing).toBe(false)
    expect(input.partyId).toBe(1)
    expect(input.lines).toHaveLength(3)
    expect(input.lines[0]).toMatchObject({
      itemId: 101,
      qtyE4: 20_000,
      rateMinor: 385_593,
      gstRateBps: 1800,
      rateIncludesTax: false
    })
  })

  it('blocks when a party cannot be created', () => {
    const plan = planFor(sheetNamed('Purchases Apr-Jun'), 'PURCHASE', {
      createMissingParties: false
    })
    expect(plan.canImport).toBe(false)
    expect(plan.stats.errors).toBeGreaterThan(0)
    expect(plan.issues.some((issue) => issue.code === 'PARTY_UNRESOLVED')).toBe(true)
    expect(plan.blockingReason).toMatch(/Fix/)
  })

  it('derives an inter-state purchase from the GSTIN when no place of supply is mapped', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Supplier GSTIN', 'Item', 'Qty', 'Rate', 'GST %'],
      ['D-1', '05-04-2026', 'Delhi Supplies', '07AABCD1234E1Z5', 'SSD 256GB', 1, 100, 18]
    ]
    const plan = planFor(
      { name: 'Interstate', rows, rowCount: rows.length, colCount: 8 },
      'PURCHASE'
    )
    const bill = plan.bills[0]
    expect(bill.placeOfSupply).toBe('07')
    expect(bill.igstMinor).toBeGreaterThan(0)
    expect(bill.cgstMinor).toBe(0)
    expect(bill.sgstMinor).toBe(0)
  })

  it('does not match a customer-only party on a purchase', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      ['G-1', '05-04-2026', 'Gupta Stores', 'SSD 256GB', 1, 100, 18]
    ]
    const plan = planFor({ name: 'Role', rows, rowCount: rows.length, colCount: 7 }, 'PURCHASE', {
      createMissingParties: false
    })
    expect(plan.canImport).toBe(false)
    expect(plan.issues.some((issue) => issue.code === 'PARTY_UNRESOLVED')).toBe(true)
  })

  it('turns an unresolved party into a ready bill when the user chooses create', () => {
    const plan = planFor(
      sheetNamed('Purchases Apr-Jun'),
      'PURCHASE',
      { createMissingParties: false },
      { 'new supplier': { kind: 'create' } }
    )
    expect(plan.canImport).toBe(true)
    expect(plan.newParties.map((row) => row.name)).toContain('New Supplier Co')
  })
})

describe('building a sales plan', () => {
  it('groups invoices, keeps free text as a warning and creates a new customer', () => {
    const plan = planFor(sheetNamed('Sales May'), 'SALES')
    expect(plan.stats.bills).toBe(7)
    expect(plan.stats.lines).toBe(9)
    expect(plan.stats.freeTextLines).toBe(1)
    expect(plan.stats.errors).toBe(0)
    expect(plan.canImport).toBe(true)
    expect(plan.newParties.map((row) => row.name)).toContain('Walk-in Customer')

    const bill = plan.bills.find((row) => row.billNo === 'INV-201')
    expect(bill?.lines).toHaveLength(3)
    const freeText = bill?.lines.find((line) => line.description === 'Installation Service')
    expect(freeText?.itemId ?? null).toBeNull()
    expect(freeText?.newItemKey ?? null).toBeNull()
  })

  it('creates an unknown item when the option is on', () => {
    const plan = planFor(sheetNamed('Sales May'), 'SALES', { createMissingItems: true })
    expect(plan.stats.freeTextLines).toBe(0)
    expect(plan.newItems.map((row) => row.name)).toContain('Installation Service')
    const line = plan.bills
      .flatMap((bill) => bill.lines)
      .find((row) => row.description === 'Installation Service')
    expect(line?.newItemKey).toBe('installation service')
  })
})

describe('row validation', () => {
  function messySheet(): SheetData {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      ['A-1', '32-13-2026', 'Sharma Traders', 'SSD 256GB', 0, 100, 18],
      ['A-1', '05-04-2026', 'Patel Electronics', 'SSD 256GB', 1, 100, 180],
      ['A-2', '05-04-2026', '', 'SSD 256GB', 1, -5, 18]
    ]
    return { name: 'Messy', rows, rowCount: rows.length, colCount: 7 }
  }

  it('blocks a bill whose total is zero', () => {
    const rows: CellValue[][] = [
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      ['Z-1', '05-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 0, 0]
    ]
    const plan = planFor({ name: 'Zero', rows, rowCount: rows.length, colCount: 7 }, 'PURCHASE')
    expect(plan.canImport).toBe(false)
    expect(plan.issues.some((issue) => issue.code === 'TOTAL_ZERO')).toBe(true)
  })

  it('names the row and the field for every blocking error', () => {
    const plan = planFor(messySheet(), 'PURCHASE')
    const codes = plan.issues.map((issue) => issue.code)
    expect(codes).toContain('DATE_INVALID')
    expect(codes).toContain('QTY_INVALID')
    expect(codes).toContain('PARTY_CONFLICT')
    expect(codes).toContain('GST_RANGE')
    expect(codes).toContain('PARTY_MISSING')
    expect(codes).toContain('RATE_INVALID')
    expect(plan.canImport).toBe(false)
    const dateIssue = plan.issues.find((issue) => issue.code === 'DATE_INVALID')
    expect(dateIssue?.rowNumber).toBe(2)
    expect(dateIssue?.fix).toMatch(/13-05-2026/)
  })
})
