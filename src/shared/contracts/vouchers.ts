import { z } from 'zod'

export const voucherTypeSchema = z.enum([
  'SALES',
  'PURCHASE',
  'RECEIPT',
  'PAYMENT',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'JOURNAL',
  'CONTRA',
  'OPENING'
])
export type VoucherType = z.infer<typeof voucherTypeSchema>

export interface VoucherLineInput {
  itemId?: number | null
  description: string
  hsn?: string | null
  uom?: string | null
  qtyE4: number
  rateMinor: number
  rateIncludesTax: boolean
  discountBps: number
  gstRateBps: number
  godownId?: number | null
}

export interface JournalLineInput {
  accountId: number
  debitMinor: number
  creditMinor: number
  narration?: string | null
}

export const voucherLineInputSchema = z.object({
  itemId: z.number().int().positive().optional().nullable(),
  description: z.string().min(1).max(300),
  hsn: z.string().max(20).optional().nullable(),
  uom: z.string().max(20).optional().nullable(),
  qtyE4: z.number().int().positive(),
  rateMinor: z.number().int().min(0),
  rateIncludesTax: z.boolean().default(false),
  discountBps: z.number().int().min(0).max(10000).default(0),
  gstRateBps: z.number().int().min(0).max(5000).default(0),
  godownId: z.number().int().positive().optional().nullable()
})

export const allocationInputSchema = z.object({
  toVoucherId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  type: z.enum(['AGAINST_REF', 'ADVANCE', 'ON_ACCOUNT', 'OPENING']).default('AGAINST_REF')
})

export const postVoucherInputSchema = z.object({
  requestId: z.string().min(8).max(80),
  type: voucherTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  partyId: z.number().int().positive().optional().nullable(),
  placeOfSupplyStateCode: z.string().max(2).optional().nullable(),
  narration: z.string().max(1000).optional().nullable(),
  referenceNo: z.string().max(80).optional().nullable(),
  /** Only honoured when the series allows manual overrides. */
  manualNumber: z.number().int().positive().optional().nullable(),
  lines: z.array(voucherLineInputSchema).default([]),
  journalLines: z
    .array(
      z.object({
        accountId: z.number().int().positive(),
        debitMinor: z.number().int().min(0).default(0),
        creditMinor: z.number().int().min(0).default(0),
        narration: z.string().max(300).optional().nullable()
      })
    )
    .default([]),
  allocations: z.array(allocationInputSchema).default([]),
  amountMinor: z.number().int().min(0).optional(),
  cashAccountId: z.number().int().positive().optional().nullable(),
  contraFromAccountId: z.number().int().positive().optional().nullable(),
  contraToAccountId: z.number().int().positive().optional().nullable(),
  paymentMethodId: z.number().int().positive().optional().nullable(),
  instrumentNo: z.string().max(80).optional().nullable(),
  reversalOfVoucherId: z.number().int().positive().optional().nullable()
})
export type PostVoucherInput = z.infer<typeof postVoucherInputSchema>

export const voucherIdSchema = z.object({ id: z.number().int().positive() })

export const listVouchersInputSchema = z.object({
  type: voucherTypeSchema.optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  partyId: z.number().int().positive().optional(),
  query: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
})
export type ListVouchersInput = z.infer<typeof listVouchersInputSchema>

export interface VoucherListRow {
  id: number
  type: VoucherType
  number: string
  date: string
  partyName: string | null
  narration: string | null
  totalMinor: number
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  createdAt: string
}

export interface VoucherLineRow {
  id: number
  description: string
  hsn: string | null
  uom: string | null
  qtyE4: number
  rateMinor: number
  discountBps: number
  gstRateBps: number
  taxableMinor: number
  taxMinor: number
  totalMinor: number
}

export interface VoucherDetail {
  id: number
  type: VoucherType
  number: string
  date: string
  dueDate: string | null
  partyId: number | null
  partyName: string | null
  partyGstin: string | null
  narration: string | null
  referenceNo: string | null
  status: 'DRAFT' | 'POSTED' | 'CANCELLED'
  createdAt: string
  cancelledAt: string | null
  cancelReason: string | null
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  roundOffMinor: number
  totalMinor: number
  lines: VoucherLineRow[]
  allocations: { toVoucherId: number; toNumber: string; amountMinor: number }[]
}

export interface OutstandingBill {
  id: number
  number: string
  date: string
  dueDate: string | null
  partyId: number
  partyName: string
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
  daysOverdue: number
}

export const outstandingInputSchema = z.object({
  partyId: z.number().int().positive().optional(),
  asOf: z.string().max(10).optional(),
  basis: z.enum(['BILL_DATE', 'DUE_DATE']).default('DUE_DATE'),
  kind: z.enum(['RECEIVABLE', 'PAYABLE', 'ALL']).default('RECEIVABLE')
})
export type OutstandingInput = z.infer<typeof outstandingInputSchema>

export const cancelVoucherInputSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(3).max(300)
})
export type CancelVoucherInput = z.infer<typeof cancelVoucherInputSchema>
