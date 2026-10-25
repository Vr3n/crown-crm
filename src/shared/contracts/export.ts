import { z } from 'zod'

/**
 * A table ready for a spreadsheet. Cells arrive as the same display strings the
 * on-screen table renders; the main process converts the columns listed in
 * `numeric` and `dateColumns` into real cell types, so money stays a number and
 * dates stay dates in Excel.
 *
 * Keeping the payload as strings means every export button sends exactly what
 * the user sees, while the renderer never needs a Node or Excel dependency.
 */
export const exportTableSchema = z.object({
  filename: z.string().min(1).max(120),
  sheetName: z.string().min(1).max(80).optional(),
  head: z.array(z.string().max(120)).min(1).max(30),
  rows: z.array(z.array(z.string().max(2000)).max(30)).max(20_000),
  numeric: z.array(z.number().int().min(0).max(29)).max(30).default([]),
  dateColumns: z.array(z.number().int().min(0).max(29)).max(30).default([]),
  footer: z.array(z.string().max(2000)).max(30).optional()
})

export type ExportTableInput = z.input<typeof exportTableSchema>
export type ExportTable = z.output<typeof exportTableSchema>

/**
 * CSV is built in the renderer (it already has the display strings) but saved
 * by the main process, so the app knows the path and can reveal the file.
 */
export const exportCsvSchema = z.object({
  filename: z.string().min(1).max(120),
  csv: z.string().min(1).max(8_000_000)
})

export type ExportCsvInput = z.input<typeof exportCsvSchema>

export interface ExportResult {
  saved: boolean
  filePath?: string
}
