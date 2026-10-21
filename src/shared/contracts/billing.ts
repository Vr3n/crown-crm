import { z } from 'zod'

/**
 * Canonical contracts for the billing/invoicing IPC surface (Module 04).
 * Input shapes are Zod-validated at the IPC boundary (guidelines §15);
 * domain rules (invoice state, line snapshot) live in the application layer.
 */

export const INVOICE_STATUSES = [
  'DRAFT',
  'OPEN',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
  'UNCOLLECTIBLE'
] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const invoiceRowSchema = z.object({
  id: z.number().int().positive(),
  number: z.string(),
  customerId: z.number().int().positive(),
  status: z.enum(INVOICE_STATUSES),
  billingName: z.string().nullable(),
  billingPhone: z.string().nullable(),
  billingEmail: z.string().nullable(),
  billingAddress: z.string().nullable(),
  subtotalMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  finalizedAt: z.string().nullable(),
  finalizedBy: z.number().int().positive().nullable(),
  voidedAt: z.string().nullable(),
  voidedBy: z.number().int().positive().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string()
})
export type InvoiceRow = z.infer<typeof invoiceRowSchema>

export const invoiceLineRowSchema = z.object({
  id: z.number().int().positive(),
  invoiceId: z.number().int().positive(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unitPriceMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxRateBps: z.number().int().nonnegative(),
  taxAmountMinor: z.number().int().nonnegative(),
  lineTotalMinor: z.number().int().nonnegative(),
  planId: z.number().int().positive().nullable(),
  offerId: z.number().int().positive().nullable(),
  sortOrder: z.number().int().nonnegative()
})
export type InvoiceLineRow = z.infer<typeof invoiceLineRowSchema>

export const invoiceDetailSchema = z.object({
  invoice: invoiceRowSchema,
  lines: z.array(invoiceLineRowSchema)
})
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

export const createInvoiceInputSchema = z.object({
  customerId: z.number().int().positive()
})
export type CreateInvoiceInput = z.infer<typeof createInvoiceInputSchema>

export const addInvoiceLineInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  description: z.string().min(1).max(500),
  quantity: z.number().int().positive().default(1),
  unitPriceMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().nonnegative(),
  planId: z.number().int().positive().nullable().optional(),
  offerId: z.number().int().positive().nullable().optional()
})
export type AddInvoiceLineInput = z.infer<typeof addInvoiceLineInputSchema>

export const removeInvoiceLineInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  lineId: z.number().int().positive()
})
export type RemoveInvoiceLineInput = z.infer<typeof removeInvoiceLineInputSchema>

export const finalizeInvoiceInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  /** Business issue date (#110). Absent → today in the Organization timezone. */
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
})
export type FinalizeInvoiceInput = z.infer<typeof finalizeInvoiceInputSchema>

export const voidInvoiceInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  reason: z.string().min(1).max(500)
})
export type VoidInvoiceInput = z.infer<typeof voidInvoiceInputSchema>

export const markUncollectibleInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  reason: z.string().min(1).max(500)
})
export type MarkUncollectibleInput = z.infer<typeof markUncollectibleInputSchema>

/** DRAFT-only edit of the customer billing snapshot; never writes back to `customers`. */
export const updateBillingSnapshotInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  billingName: z.string().min(1).max(200),
  billingPhone: z.string().max(20).nullable(),
  billingEmail: z.string().email().nullable(),
  billingAddress: z.string().max(500).nullable()
})
export type UpdateBillingSnapshotInput = z.infer<typeof updateBillingSnapshotInputSchema>

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

export const invoiceIdRequestSchema = z.object({
  invoiceId: z.number().int().positive()
})
export type InvoiceIdRequest = z.infer<typeof invoiceIdRequestSchema>

export const customerInvoicesRequestSchema = z.object({
  customerId: z.number().int().positive()
})
export type CustomerInvoicesRequest = z.infer<typeof customerInvoicesRequestSchema>

/**
 * Display-only preview of the next invoice number (Module 04 §36). Never
 * reserves — the real number is assigned inside the finalize transaction.
 * Format: {PREFIX}-DDMMYY-NN (e.g. CRO-010926-01)
 */
export interface InvoiceNumberPreview {
  dateKey: string
  prefix: string
  nextValue: number
  preview: string
}

/** Optional issue date so the preview follows the picked billing date (#110). */
export const invoiceNumberPreviewRequestSchema = z
  .object({
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .default({})
export type InvoiceNumberPreviewRequest = z.infer<typeof invoiceNumberPreviewRequestSchema>
