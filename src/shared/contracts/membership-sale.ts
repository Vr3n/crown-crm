import { z } from 'zod'

/**
 * SellMembership contract — the single RPC that creates
 * Customer (if needed) + Membership + Invoice (+Line) + Payment + Allocation
 * + Lead WON transition + Offer redemption in one atomic tx.
 * Frontend sends money as integer minor units (paise) — never floats.
 * Dates are UTC YYYY-MM-DD (Asia/Kolkata wall date serialized).
 * discountType NONE is UI placeholder → backend maps to offerId null + 0 discount.
 */

export const sellMembershipInputSchema = z
  .object({
    leadId: z.number().int().positive(),
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
    /** Free-text payment reference (e.g. cheque no., UTR). Optional, informational. */
    reference: z.string().max(200).nullable().optional(),
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

export type SellMembershipInput = z.infer<typeof sellMembershipInputSchema>

export const sellMembershipResultSchema = z.object({
  membershipId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  invoiceNumber: z.string().min(1),
  paymentId: z.number().int().min(0)
})

export type SellMembershipResult = z.infer<typeof sellMembershipResultSchema>
