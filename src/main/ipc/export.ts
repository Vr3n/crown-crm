import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'
import { exportTableToExcel } from '../application/export'
import { currencyCodeSchema } from '../../shared/contracts/money'
import { isValidTimezone } from '../domain/dates'

const exportColumnSchema = z.object({
  header: z.string().min(1),
  key: z.string().min(1),
  width: z.number().positive().optional(),
  format: z.enum(['text', 'money', 'date', 'datetime', 'number', 'isodate']).optional()
})

const exportExcelInputSchema = z.object({
  sheetName: z.string().min(1).max(31), // Excel sheet name limit
  filename: z.string().min(1).max(200),
  columns: z.array(exportColumnSchema).min(1).max(100),
  rows: z.array(z.record(z.string(), z.unknown())).max(10000),
  currency: currencyCodeSchema,
  /** IANA zone for date rendering (#110). Absent → Organization default. */
  timezone: z
    .string()
    .max(64)
    .refine((tz) => isValidTimezone(tz), { message: 'timezone must be a valid IANA name' })
    .optional()
})

export function registerExportIpc(): void {
  handle(IPC_CHANNELS.EXPORT_EXCEL, exportExcelInputSchema, (input) => exportTableToExcel(input))
}
