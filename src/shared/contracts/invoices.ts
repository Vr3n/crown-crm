import { z } from 'zod'

/**
 * Shared contracts for the invoices IPC surface (Module 04 read models).
 * Output types match the renderer's expected shapes exactly.
 */

export const INVOICE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
  'UNCOLLECTIBLE'
] as const

/* -------------------------------------------------------------------------- */
/* Output types (read models)                                                   */
/* -------------------------------------------------------------------------- */

export const customerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  personId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional()
})
export type CustomerRef = z.infer<typeof customerRefSchema>

export const invoiceLineOutputSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPriceMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxRateBps: z.number().int(),
  taxAmountMinor: z.number().int(),
  lineTotalMinor: z.number().int()
})
export type InvoiceLineOutput = z.infer<typeof invoiceLineOutputSchema>

export const invoiceAllocationOutputSchema = z.object({
  id: z.string(),
  amountMinor: z.number().int(),
  method: z.string(),
  reference: z.string(),
  receivedAt: z.string(),
  receivedBy: z.string()
})
export type InvoiceAllocationOutput = z.infer<typeof invoiceAllocationOutputSchema>

export const invoiceRefundOutputSchema = z.object({
  id: z.string(),
  refundNo: z.string(),
  refundDate: z.string(),
  amountMinor: z.number().int(),
  method: z.string(),
  reason: z.string(),
  sourcePaymentNo: z.string()
})
export type InvoiceRefundOutput = z.infer<typeof invoiceRefundOutputSchema>

export const invoiceOutputSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  customer: customerRefSchema,
  // Billing snapshot (Module 04 §21) — document history, not the live customer.
  billingName: z.string().nullable().optional(),
  billingPhone: z.string().nullable().optional(),
  billingEmail: z.string().nullable().optional(),
  billingAddress: z.string().nullable().optional(),
  issuedAt: z.string(),
  dueAt: z.string().optional(),
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE']),
  lines: z.array(invoiceLineOutputSchema),
  allocations: z.array(invoiceAllocationOutputSchema),
  refunds: z.array(invoiceRefundOutputSchema),
  createdBy: z.string(),
  subtotalMinor: z.number().int(),
  taxTotal: z.number(),
  totalMinor: z.number().int(),
  paidMinor: z.number().int(),
  outstandingMinor: z.number().int()
})
export type InvoiceOutput = z.infer<typeof invoiceOutputSchema>

/* -------------------------------------------------------------------------- */
/* Input types (queries)                                                        */
/* -------------------------------------------------------------------------- */

export const invoiceIdRequestSchema = z.object({
  invoiceId: z.string()
})
export type InvoiceIdRequest = z.infer<typeof invoiceIdRequestSchema>

export const invoicesByStatusRequestSchema = z.object({
  status: z.enum(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE']).optional()
})
export type InvoicesByStatusRequest = z.infer<typeof invoicesByStatusRequestSchema>
