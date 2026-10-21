import { z } from 'zod'

/**
 * Shared contracts for the collections IPC surface (daily collection report).
 * Output types match the renderer's expected shapes exactly.
 */

/* -------------------------------------------------------------------------- */
/* Output types (read models)                                                   */
/* -------------------------------------------------------------------------- */

export const collectionCustomerRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  personId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional()
})
export type CollectionCustomerRef = z.infer<typeof collectionCustomerRefSchema>

export const collectionPaymentAllocationSchema = z.object({
  invoiceNo: z.string(),
  amountMinor: z.number().int()
})
export type CollectionPaymentAllocation = z.infer<typeof collectionPaymentAllocationSchema>

export const paymentRecordOutputSchema = z.object({
  id: z.string(),
  reference: z.string(),
  customer: collectionCustomerRefSchema,
  amountMinor: z.number().int(),
  method: z.string(),
  receivedAt: z.string(),
  receivedBy: z.string(),
  allocations: z.array(collectionPaymentAllocationSchema),
  notes: z.string().optional()
})
export type PaymentRecordOutput = z.infer<typeof paymentRecordOutputSchema>

export const methodTotalSchema = z.object({
  method: z.string(),
  totalMinor: z.number().int(),
  count: z.number()
})
export type MethodTotalOutput = z.infer<typeof methodTotalSchema>

export const dayCollectionSchema = z.object({
  date: z.string(),
  totalMinor: z.number().int(),
  paymentCount: z.number(),
  recordedBy: z.array(z.string()),
  byMethod: z.array(methodTotalSchema)
})
export type DayCollectionOutput = z.infer<typeof dayCollectionSchema>
