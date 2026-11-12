import { fieldsFor } from '@shared/excel-import/fields'
import { cellText } from '@shared/excel-import/parse'
import type { CellValue, ImportTarget, SheetData, WorkbookData } from '@shared/excel-import/types'

/**
 * The only module that knows about SheetJS.
 *
 * The library is loaded on demand, so the rest of the app does not pay for a
 * spreadsheet parser until someone opens the importer. Everything downstream
 * receives a plain matrix, so the import logic can be tested without it.
 */
function normaliseSheet(name: string, matrix: CellValue[][]): SheetData {
  const rows = matrix.map((row) =>
    row.map((cell) => {
      if (cell === undefined) return null
      if (cell instanceof Date) return cell
      if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
        return cell
      }
      return cell === null ? null : String(cell)
    })
  )

  let lastRow = rows.length - 1
  while (lastRow >= 0 && rows[lastRow].every((cell) => !cellText(cell))) lastRow -= 1
  const trimmedRows = rows.slice(0, lastRow + 1)

  let lastCol = -1
  trimmedRows.forEach((row) => {
    row.forEach((cell, col) => {
      if (cellText(cell)) lastCol = Math.max(lastCol, col)
    })
  })

  const width = lastCol + 1
  const padded = trimmedRows.map((row) => {
    const next = row.slice(0, width)
    while (next.length < width) next.push(null)
    return next
  })

  return { name, rows: padded, rowCount: padded.length, colCount: width }
}

export async function readWorkbook(buffer: ArrayBuffer, fileName: string): Promise<WorkbookData> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true })
  const sheets = workbook.SheetNames.map((name) => {
    const worksheet = workbook.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<CellValue[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true
    })
    return normaliseSheet(name, matrix)
  }).filter((sheet) => sheet.rowCount > 0)

  if (sheets.length === 0) {
    throw new Error('No sheet in this file has data. Check that the workbook is not empty.')
  }

  return { fileName, sheets }
}

export async function readWorkbookFile(file: File): Promise<WorkbookData> {
  const buffer = await file.arrayBuffer()
  return readWorkbook(buffer, file.name)
}

/** A template with the field labels as headers and one example row. */
export async function downloadTemplate(target: ImportTarget): Promise<void> {
  const XLSX = await import('xlsx')
  const fields = fieldsFor(target)
  const example = fields.map((field) => field.example)
  const rows = [fields.map((field) => field.label), example]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  worksheet['!cols'] = fields.map((field) => ({ wch: Math.max(14, field.label.length + 4) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    target === 'PURCHASE' ? 'Purchase bills' : 'Sales invoices'
  )
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download =
    target === 'PURCHASE' ? 'purchase-bills-template.xlsx' : 'sales-invoices-template.xlsx'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
