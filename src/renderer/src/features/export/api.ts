import type { CurrencyCode } from '@/lib/money'

type CellFormat = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'isodate'

export interface ExportColumn {
  header: string
  key: string
  width?: number
  format?: CellFormat
}

export interface ExportTableInput {
  sheetName: string
  filename: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
  currency: CurrencyCode
  /** IANA zone for date rendering (#110); absent → Organization default. */
  timezone?: string
}

/**
 * Sends table data to the main process for Excel generation.
 * Returns the absolute path of the saved .xlsx file.
 */
export async function exportExcel(input: ExportTableInput): Promise<string> {
  return window.api.export.excel(input)
}
