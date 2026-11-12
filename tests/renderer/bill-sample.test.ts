import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readWorkbook } from '@/features/imports/lib/workbook'
import { createDemoRuntime } from '@/features/imports/lib/demo-runtime'
import { autoMap } from '@shared/excel-import/automap'
import { detectHeaderRow, suggestTableRange } from '@shared/excel-import/parse'
import { buildPlan } from '@shared/excel-import/plan'
import { DEFAULT_OPTIONS } from '@shared/excel-import/types'
import type { ImportTarget, SheetData } from '@shared/excel-import/types'
import type { ItemRow, PartyRow } from '@shared/contracts/masters'

const SAMPLE = resolve('docs/guides/sample-bills-from-pdfs.xlsx')

let sheets: SheetData[] = []
let parties: PartyRow[] = []
let items: ItemRow[] = []

beforeAll(async () => {
  const buffer = readFileSync(SAMPLE)
  const workbook = await readWorkbook(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    'sample-bills-from-pdfs.xlsx'
  )
  sheets = workbook.sheets
  const runtime = createDemoRuntime()
  parties = await runtime.listParties()
  items = await runtime.listItems()
})

function planFor(sheet: SheetData, target: ImportTarget) {
  const range = suggestTableRange(sheet.rows, sheet.name, target)
  const headerRow = detectHeaderRow(sheet.rows, range, target)
  const mapping = autoMap(sheet.rows, headerRow, range.startCol, range.endCol, target)
  return {
    range,
    headerRow,
    mapping,
    plan: buildPlan({
      target,
      rows: sheet.rows,
      range,
      headerRow,
      mapping,
      options: { ...DEFAULT_OPTIONS, createMissingItems: true },
      parties,
      items,
      partyResolutions: {},
      companyStateCode: '27',
      roundOffMode: 'INVOICE'
    })
  }
}

describe('sample bills built from the PDFs', () => {
  it('imports the purchase bill as one bill with nine lines and the printed total', () => {
    const sheet = sheets.find((row) => row.name === 'Purchase bills')
    if (!sheet) throw new Error('Missing Purchase bills sheet')
    const { range, headerRow, mapping, plan } = planFor(sheet, 'PURCHASE')

    expect(headerRow).toBe(8)
    expect(range.endRow).toBe(17)
    expect(mapping.billNo).toBe(0)
    expect(mapping.date).toBe(1)
    expect(mapping.party).toBe(2)
    expect(mapping.item).toBe(5)
    expect(mapping.hsn).toBe(6)
    expect(mapping.qty).toBe(7)
    expect(mapping.rate).toBe(9)
    expect(mapping.discount).toBe(10)
    expect(mapping.gst).toBe(11)

    expect(plan.stats.bills).toBe(1)
    expect(plan.stats.lines).toBe(9)
    expect(plan.stats.errors).toBe(0)
    expect(plan.canImport).toBe(true)

    const bill = plan.bills[0]
    expect(bill.partyName).toBe('TECHCONNECT INFORMATIQUE')
    expect(bill.partyAction).toBe('create')
    // The printed discount is 15.254%. The domain stores discount in whole
    // basis points, so the intermediate values differ by a few paise. The
    // printed grand total is what the user checks, and it matches exactly.
    expect(bill.taxableMinor).toBe(1_317_364)
    expect(bill.cgstMinor).toBe(118_562)
    expect(bill.sgstMinor).toBe(118_562)
    expect(bill.roundOffMinor).toBe(12)
    expect(bill.totalMinor).toBe(1_554_500)
  })

  it('imports the sales bill as one invoice with the printed total', () => {
    const sheet = sheets.find((row) => row.name === 'Sales bill')
    if (!sheet) throw new Error('Missing Sales bill sheet')
    const { range, plan } = planFor(sheet, 'SALES')

    expect(range.endRow).toBe(9)
    expect(plan.stats.bills).toBe(1)
    expect(plan.stats.lines).toBe(1)
    expect(plan.stats.errors).toBe(0)
    expect(plan.canImport).toBe(true)

    const bill = plan.bills[0]
    expect(bill.partyName).toBe('Acme DISTRIBUTOR')
    expect(bill.partyAction).toBe('create')
    expect(bill.taxableMinor).toBe(385_593)
    expect(bill.cgstMinor).toBe(34_703)
    expect(bill.sgstMinor).toBe(34_703)
    expect(bill.totalMinor).toBe(455_000)
  })
})
