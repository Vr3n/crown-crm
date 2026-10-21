import { z } from 'zod'

/**
 * Canonical contracts for the finance IPC surface (Module 05).
 * Input shapes are Zod-validated at the IPC boundary (guidelines §15);
 * domain rules (allocation math, status derivation) live in the application layer.
 */

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const paymentRowSchema = z.object({
  id: z.number().int().positive(),
  customerId: z.number().int().positive(),
  paymentDate: z.string(),
  amountMinor: z.number().int().positive(),
  paymentMethod: z.string(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string()
})
export type PaymentRow = z.infer<typeof paymentRowSchema>

export const paymentAllocationRowSchema = z.object({
  id: z.number().int().positive(),
  paymentId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  createdAt: z.string()
})
export type PaymentAllocationRow = z.infer<typeof paymentAllocationRowSchema>

export const refundRowSchema = z.object({
  id: z.number().int().positive(),
  paymentId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  reason: z.string(),
  createdAt: z.string()
})
export type RefundRow = z.infer<typeof refundRowSchema>

export const creditRowSchema = z.object({
  id: z.number().int().positive(),
  customerId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  remainingMinor: z.number().int().nonnegative(),
  reason: z.string(),
  expiresAt: z.string().nullable(),
  createdAt: z.string()
})
export type CreditRow = z.infer<typeof creditRowSchema>

export const paymentMethodRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  sortOrder: z.number().int().nonnegative(),
  active: z.boolean()
})
export type PaymentMethodRow = z.infer<typeof paymentMethodRowSchema>

export const invoicePaymentStateSchema = z.object({
  invoiceId: z.number().int().positive(),
  totalMinor: z.number().int().nonnegative(),
  allocatedMinor: z.number().int().nonnegative(),
  refundedMinor: z.number().int().nonnegative(),
  outstandingMinor: z.number().int().nonnegative(),
  status: z.string()
})
export type InvoicePaymentState = z.infer<typeof invoicePaymentStateSchema>

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

export const recordPaymentInputSchema = z.object({
  customerId: z.number().int().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountMinor: z.number().int().positive(),
  paymentMethod: z.string().min(1),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional()
})
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>

export const allocatePaymentInputSchema = z.object({
  paymentId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  amountMinor: z.number().int().positive()
})
export type AllocatePaymentInput = z.infer<typeof allocatePaymentInputSchema>

export const recordAndAllocatePaymentInputSchema = z.object({
  customerId: z.number().int().positive(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountMinor: z.number().int().positive(),
  paymentMethod: z.string().min(1),
  invoiceId: z.number().int().positive(),
  reference: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional()
})
export type RecordAndAllocatePaymentInput = z.infer<typeof recordAndAllocatePaymentInputSchema>

export const issueRefundInputSchema = z.object({
  paymentId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  reason: z.string().min(1).max(500)
})
export type IssueRefundInput = z.infer<typeof issueRefundInputSchema>

export const issueCreditInputSchema = z.object({
  customerId: z.number().int().positive(),
  amountMinor: z.number().int().positive(),
  reason: z.string().min(1).max(500),
  expiresAt: z.string().nullable().optional()
})
export type IssueCreditInput = z.infer<typeof issueCreditInputSchema>

export const applyCreditInputSchema = z.object({
  creditId: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  amountMinor: z.number().int().positive()
})
export type ApplyCreditInput = z.infer<typeof applyCreditInputSchema>

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const paymentIdRequestSchema = z.object({
  paymentId: z.number().int().positive()
})
export type PaymentIdRequest = z.infer<typeof paymentIdRequestSchema>

export const customerPaymentsRequestSchema = z.object({
  customerId: z.number().int().positive()
})
export type CustomerPaymentsRequest = z.infer<typeof customerPaymentsRequestSchema>

export const customerCreditBalanceRequestSchema = z.object({
  customerId: z.number().int().positive()
})
export type CustomerCreditBalanceRequest = z.infer<typeof customerCreditBalanceRequestSchema>

export const invoicePaymentStateRequestSchema = z.object({
  invoiceId: z.number().int().positive()
})
export type InvoicePaymentStateRequest = z.infer<typeof invoicePaymentStateRequestSchema>

export const outstandingInvoicesRequestSchema = z.object({
  customerId: z.number().int().positive()
})
export type OutstandingInvoicesRequest = z.infer<typeof outstandingInvoicesRequestSchema>

export const outstandingInvoiceRowSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  customerName: z.string(),
  customerPhone: z.string().optional(),
  line: z.string(),
  issuedAt: z.string(),
  totalMinor: z.number().int().nonnegative(),
  paidMinor: z.number().int().nonnegative(),
  status: z.string()
})
export type OutstandingInvoiceRow = z.infer<typeof outstandingInvoiceRowSchema>

/* -------------------------------------------------------------------------- */
/* Org-wide list queries                                                       */
/* -------------------------------------------------------------------------- */

export const listPaymentsInputSchema = z.object({})
export type ListPaymentsInput = z.infer<typeof listPaymentsInputSchema>

export const listRefundsInputSchema = z.object({})
export type ListRefundsInput = z.infer<typeof listRefundsInputSchema>

export const listCreditsInputSchema = z.object({})
export type ListCreditsInput = z.infer<typeof listCreditsInputSchema>
