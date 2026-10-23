import { z } from 'zod'
import { voucherTypeSchema } from './vouchers'

export const numberResetPeriodSchema = z.enum(['YEARLY', 'MONTHLY', 'NEVER'])
export type NumberResetPeriod = z.infer<typeof numberResetPeriodSchema>

/**
 * Voucher numbering settings. One row per voucher type per company, edited from
 * Company settings or the first run wizard.
 */
export const numberingSettingSchema = z.object({
  voucherType: voucherTypeSchema,
  series: z.string().trim().min(2).max(8),
  prefix: z.string().max(40),
  suffix: z.string().max(40),
  padding: z.number().int().min(1).max(8),
  startNumber: z.number().int().min(1).max(99999999),
  resetPeriod: numberResetPeriodSchema,
  manualOverride: z.boolean()
})

export const updateNumberingInputSchema = z.object({
  requestId: z.string().min(1),
  items: z.array(numberingSettingSchema).min(1).max(12)
})
export type UpdateNumberingInput = z.infer<typeof updateNumberingInputSchema>

export interface NumberingRow {
  voucherType: z.infer<typeof voucherTypeSchema>
  label: string
  series: string
  prefix: string
  suffix: string
  padding: number
  startNumber: number
  resetPeriod: NumberResetPeriod
  manualOverride: boolean
  /** Financial year the preview belongs to. */
  fy: string
  /** Next number that would be allocated, formatted. */
  nextNumber: string
  /** Highest value already used in the current reset period. */
  lastUsed: number
  /** Posted vouchers using this voucher type. */
  usedCount: number
}
