import { z } from 'zod'

/**
 * Membership Cancellation & Renewal contracts.
 * Frontend sends money as integer minor units (paise) — never floats.
 * Dates are UTC YYYY-MM-DD.
 */

export const CANCELLATION_REASON_CODES = [
  'COST',
  'RELOCATION',
  'HEALTH',
  'FACILITIES',
  'SERVICE',
  'COMPETITOR',
  'UNUSED',
  'FAMILY',
  'OTHER'
] as const

export type CancellationReasonCode = (typeof CANCELLATION_REASON_CODES)[number]

export const cancellationReasonCodeSchema = z.enum(CANCELLATION_REASON_CODES)

export const CANCELLATION_TIMING = ['IMMEDIATE', 'END_OF_PERIOD', 'NOTICE_DAYS'] as const

export type CancellationTiming = (typeof CANCELLATION_TIMING)[number]

export const cancellationTimingSchema = z.enum(CANCELLATION_TIMING)

/* -------------------------------------------------------------------------- */
/* Cancel Membership                                                          */
/* -------------------------------------------------------------------------- */

export const cancelMembershipInputSchema = z.object({
  membershipId: z.number().int().positive(),
  timing: cancellationTimingSchema,
  reasonCode: cancellationReasonCodeSchema,
  reasonDetail: z.string().max(500).nullable().optional(),
  noticeEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'noticeEndDate must be a YYYY-MM-DD date')
    .nullable()
    .optional(),
  refund: z
    .object({
      mode: z.enum(['NONE', 'FULL', 'PRORATED', 'CUSTOM']),
      amountMinor: z.number().int().min(0).nullable().optional(),
      /** When the refund is issued: now, or on the cancellation effective date. */
      timing: z.enum(['IMMEDIATE', 'ON_EFFECTIVE_DATE']).optional()
    })
    .nullable()
    .optional()
})

export type CancelMembershipInput = z.infer<typeof cancelMembershipInputSchema>

export const cancelMembershipResultSchema = z.object({
  membershipId: z.number().int().positive(),
  effectiveDate: z.string(),
  status: z.string(),
  refundIssued: z.boolean(),
  refundScheduled: z.boolean(),
  refundAmountMinor: z.number().int().min(0)
})

export type CancelMembershipResult = z.infer<typeof cancelMembershipResultSchema>

/* -------------------------------------------------------------------------- */
/* Revert Cancellation                                                        */
/* -------------------------------------------------------------------------- */

export const revertCancellationInputSchema = z.object({
  membershipId: z.number().int().positive()
})

export type RevertCancellationInput = z.infer<typeof revertCancellationInputSchema>

/* -------------------------------------------------------------------------- */
/* Renew Membership                                                           */
/* -------------------------------------------------------------------------- */

export const renewMembershipInputSchema = z
  .object({
    customerId: z.number().int().positive(),
    sourceMembershipId: z.number().int().positive().optional(),
    planId: z.number().int().positive(),
    offerId: z.number().int().positive().nullable(),
    joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    /** Shared billing date: drives BOTH Invoice finalized_at and Payment payment_date (#110). */
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    basePriceMinor: z.number().int().min(0),
    discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED_AMOUNT', 'OVERRIDE_PRICE']),
    discountValueMinor: z.number().int().min(0).nullable(),
    paidAmountMinor: z.number().int().min(0),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
    transactionId: z.string().uuid()
  })
  .superRefine((val, ctx) => {
    if (val.discountType === 'NONE' && val.discountValueMinor !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'discountValue must be null when discountType is NONE',
        path: ['discountValueMinor']
      })
    }
    if (val.discountType !== 'NONE' && val.discountValueMinor === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'discountValue is required when discountType is not NONE',
        path: ['discountValueMinor']
      })
    }
  })

export type RenewMembershipInput = z.infer<typeof renewMembershipInputSchema>

export const renewMembershipResultSchema = z.object({
  membershipId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  invoiceNumber: z.string().min(1),
  paymentId: z.number().int().min(0)
})

export type RenewMembershipResult = z.infer<typeof renewMembershipResultSchema>

/* -------------------------------------------------------------------------- */
/* Membership Refund State (read model for cancel dialog)                     */
/* -------------------------------------------------------------------------- */

export const membershipRefundStateRequestSchema = z.object({
  membershipId: z.number().int().positive()
})

export type MembershipRefundStateRequest = z.infer<typeof membershipRefundStateRequestSchema>

export const membershipRefundStateSchema = z.object({
  invoiceId: z.number().int().positive().nullable(),
  invoiceNo: z.string().nullable(),
  totalPaidMinor: z.number().int().min(0),
  refundedMinor: z.number().int().min(0),
  refundableMinor: z.number().int().min(0),
  proratedSuggestedMinor: z.number().int().min(0),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  durationDays: z.number().int().min(0).nullable(),
  finalPriceMinor: z.number().int().min(0).nullable(),
  payments: z.array(
    z.object({
      paymentId: z.number().int().positive(),
      amountMinor: z.number().int().min(0),
      availableMinor: z.number().int().min(0)
    })
  )
})

export type MembershipRefundState = z.infer<typeof membershipRefundStateSchema>
