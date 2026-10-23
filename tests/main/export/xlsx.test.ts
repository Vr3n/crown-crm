import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildXlsx,
  parseExportDate,
  parseExportNumber,
  sheetNameFrom
} from '../../../src/main/export/xlsx'

describe('parseExportNumber', () => {
  it('reads the money strings the tables render', () => {
    expect(parseExportNumber('₹1,23,456.78')).toBe(123456.78)
    expect(parseExportNumber('-₹1,200.00')).toBe(-1200)
    expect(parseExportNumber('(1,200.00)')).toBe(-1200)
    expect(parseExportNumber('18%')).toBe(18)
  })

  it('leaves dashes and words as text', () => {
    expect(parseExportNumber('—')).toBeNull()
    expect(parseExportNumber('-')).toBeNull()
    expect(parseExportNumber('')).toBeNull()
    expect(parseExportNumber('not posted')).toBeNull()
  })
})

describe('parseExportDate', () => {
  it('reads ISO, named and slashed dates', () => {
    expect(parseExportDate('2026-04-01')?.getDate()).toBe(1)
    expect(parseExportDate('23 Oct 2026')?.getMonth()).toBe(9)
    expect(parseExportDate('23/10/2026')?.getFullYear()).toBe(2026)
  })

  it('rejects impossible and unknown dates', () => {
    expect(parseExportDate('2026-02-31')).toBeNull()
    expect(parseExportDate('not a date')).toBeNull()
  })
})

describe('sheetNameFrom', () => {
  it('removes characters Excel rejects and caps the length', () => {
    expect(sheetNameFrom('Sales: Register / April?')).toBe('Sales Register April')
    expect(sheetNameFrom('x'.repeat(40))).toHaveLength(31)
  })
})

describe('buildXlsx', () => {
  it('writes money as numbers, dates as dates, a frozen header and a bold footer', async () => {
    const buffer = await buildXlsx({
      filename: 'sales-register',
      sheetName: 'Sales Register',
      head: ['Date', 'Number', 'Party', 'Total', 'Booked'],
      rows: [
        ['2026-04-01', 'INV/0001', 'Acme', '₹1,234.50', '2026-04-02'],
        ['2026-04-03', 'INV/0002', 'Beta', '₹0.00', '2026-04-03']
      ],
      numeric: [3],
      dateColumns: [0],
      footer: ['Total', '', '', '₹1,234.50', '']
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.getWorksheet('Sales Register')

    expect(sheet).toBeDefined()
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet!.getCell('A1').value).toBe('Date')
    expect(sheet!.getCell('A1').font?.bold).toBe(true)
    expect(sheet!.getCell('A2').value).toBeInstanceOf(Date)
    expect((sheet!.getCell('A2').value as Date).getDate()).toBe(1)
    expect(sheet!.getCell('E2').value).toBeInstanceOf(Date)
    expect(sheet!.getCell('D2').value).toBe(1234.5)
    expect(sheet!.getCell('D2').numFmt).toContain('₹')
    expect(sheet!.getCell('D4').value).toBe(1234.5)
    expect(sheet!.getCell('D4').font?.bold).toBe(true)
    expect(sheet!.getCell('D4').border?.top?.style).toBe('thin')
  })
})
