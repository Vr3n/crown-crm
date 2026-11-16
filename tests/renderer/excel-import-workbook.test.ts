import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { readWorkbook } from '@/features/imports/lib/workbook'

describe('reading a real workbook', () => {
  it('keeps sheet order, dates and blank rows, and trims trailing blanks', async () => {
    const first = XLSX.utils.aoa_to_sheet([
      ['Purchase register', null, null],
      [],
      [],
      ['Supplier Bill No', 'Bill Date', 'Amount'],
      ['SH-1042', new Date(2026, 3, 5), 4550],
      ['SH-1043', new Date(2026, 4, 3), 9100],
      [null, null, null],
      [null, null, null]
    ])
    const second = XLSX.utils.aoa_to_sheet([
      ['Name', 'GSTIN'],
      ['Sharma Traders', '27AABCS1234C1Z5']
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, first, 'Purchases')
    XLSX.utils.book_append_sheet(workbook, second, 'Parties')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

    const parsed = await readWorkbook(buffer, 'test.xlsx')
    expect(parsed.fileName).toBe('test.xlsx')
    expect(parsed.sheets.map((sheet) => sheet.name)).toEqual(['Purchases', 'Parties'])

    const sheet = parsed.sheets[0]
    expect(sheet.rowCount).toBe(6)
    expect(sheet.colCount).toBe(3)
    expect(sheet.rows[0][0]).toBe('Purchase register')
    expect(sheet.rows[3]).toEqual(['Supplier Bill No', 'Bill Date', 'Amount'])
    expect(sheet.rows[4][1]).toBeInstanceOf(Date)
    expect(sheet.rows[4][2]).toBe(4550)

    const parties = parsed.sheets[1]
    expect(parties.rows[1][0]).toBe('Sharma Traders')
  })

  it('rejects a workbook with no data', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[]]), 'Empty')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    await expect(readWorkbook(buffer, 'empty.xlsx')).rejects.toThrow(/no sheet/i)
  })
})
