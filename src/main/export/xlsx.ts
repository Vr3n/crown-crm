import ExcelJS from 'exceljs'
import type { ExportTable } from '../../shared/contracts/export'

const MONEY_FORMAT = '"₹"#,##0.00'
const DATE_FORMAT = 'dd mmm yyyy'
const MAX_SHEET_NAME = 31

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
}

/** Excel rejects []:*?/\ in sheet names and stops at 31 characters. */
export function sheetNameFrom(value: string): string {
  const cleaned = value
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return (cleaned || 'Export').slice(0, MAX_SHEET_NAME)
}

/**
 * The renderer sends display strings, so parse the columns it marked numeric.
 * Handles the rupee sign, Indian grouping, a leading minus and accountancy
 * parentheses; anything that is not a number stays text.
 */
export function parseExportNumber(value: string): number | null {
  const text = value.replace(/\u00a0/g, ' ').trim()
  if (!text) return null

  const parenthesised = /^\(.*\)$/.test(text)
  const cleaned = text.replace(/[^0-9.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null

  const number = Number(cleaned)
  if (!Number.isFinite(number)) return null
  return parenthesised ? -Math.abs(number) : number
}

function localDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day)
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null
  }
  return date
}

/** Parse the date shapes reports use: ISO, `23 Oct 2026`, and `23/10/2026`. */
export function parseExportDate(value: string): Date | null {
  const text = value.trim()

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (iso) return localDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))

  const named = /^(\d{1,2})[ /-]([A-Za-z]{3,})[ /-](\d{4})$/.exec(text)
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()]
    if (month === undefined) return null
    return localDate(Number(named[3]), month, Number(named[1]))
  }

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text)
  if (slashed) return localDate(Number(slashed[3]), Number(slashed[2]) - 1, Number(slashed[1]))

  return null
}

function addRow(
  sheet: ExcelJS.Worksheet,
  values: string[],
  numeric: Set<number>,
  dates: Set<number>
): ExcelJS.Row {
  const converted = values.map((value, index) => {
    if (numeric.has(index)) return parseExportNumber(value) ?? value
    if (dates.has(index)) return parseExportDate(value) ?? value
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? (parseExportDate(value) ?? value) : value
  })

  const row = sheet.addRow(converted)
  row.eachCell((cell, column) => {
    if (typeof cell.value === 'number' && numeric.has(column - 1)) {
      cell.numFmt = MONEY_FORMAT
    }
    if (cell.value instanceof Date) cell.numFmt = DATE_FORMAT
  })
  return row
}

/**
 * Build a real .xlsx workbook from a formatted table. The first row stays
 * frozen, money columns are numbers with an INR format, dates are date cells,
 * and the footer totals are bold with a rule above them.
 */
export async function buildXlsx(input: ExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Crown Books'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetNameFrom(input.sheetName ?? input.filename), {
    views: [{ state: 'frozen', ySplit: 1 }]
  })

  const numeric = new Set(input.numeric)
  const dates = new Set(input.dateColumns)

  const widths = input.head.map((header, index) => {
    const longest = input.rows.reduce(
      (length, row) => Math.max(length, (row[index] ?? '').length),
      header.length
    )
    return Math.min(48, Math.max(10, longest + 2))
  })

  sheet.columns = input.head.map((header, index) => ({
    header,
    key: `column-${index}`,
    width: widths[index]
  }))

  const head = sheet.getRow(1)
  head.font = { bold: true, color: { argb: 'FF2B2B2B' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE8DE' } }
  head.alignment = { vertical: 'middle', horizontal: 'left' }
  head.height = 22

  for (const values of input.rows) addRow(sheet, values, numeric, dates)

  if (input.footer) {
    const footer = addRow(sheet, input.footer, numeric, dates)
    footer.font = { bold: true }
    footer.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FF2B2B2B' } } }
    })
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1 + input.rows.length, column: input.head.length }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
