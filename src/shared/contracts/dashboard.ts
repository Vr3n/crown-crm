import { z } from 'zod'

/**
 * Shared contracts for the dashboard IPC surface (Module 09 read models).
 * Output types match the renderer's expected shapes exactly.
 */

/* -------------------------------------------------------------------------- */
/* Output types (read models)                                                   */
/* -------------------------------------------------------------------------- */

export const dashboardPersonRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  personId: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional()
})
export type DashboardPersonRef = z.infer<typeof dashboardPersonRefSchema>

export const membershipExpirationSchema = z.object({
  id: z.string(),
  member: dashboardPersonRefSchema,
  plan: z.string(),
  purchasedAt: z.string(),
  expiresAt: z.string(),
  /** Renewal shortcut (#110): direct renew-dialog inputs. */
  customerId: z.string(),
  planId: z.string().nullable(),
  joiningDate: z.string()
})
export type MembershipExpirationOutput = z.infer<typeof membershipExpirationSchema>

export const paymentDueSchema = z.object({
  id: z.string(),
  member: dashboardPersonRefSchema,
  plan: z.string(),
  purchasedAt: z.string(),
  amountDueMinor: z.number().int(),
  totalMinor: z.number().int(),
  invoiceNumber: z.string(),
  planStartDate: z.string(),
  planEndDate: z.string(),
  joiningDate: z.string(),
  membershipAmountMinor: z.number().int(),
  membershipPurchasedAt: z.string(),
  /** Renewal shortcut (#110, Phase 2). Null membership/plan → hide Renew. */
  customerId: z.string(),
  membershipId: z.string().nullable(),
  renewPlanId: z.string().nullable()
})
export type PaymentDueOutput = z.infer<typeof paymentDueSchema>

export const membershipInvoiceSchema = z.object({
  id: z.string(),
  invoiceNo: z.string(),
  label: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  amountMinor: z.number().int(),
  status: z.enum(['PAID', 'OVERDUE']),
  paidAt: z.string().optional()
})
export type MembershipInvoiceOutput = z.infer<typeof membershipInvoiceSchema>

export const memberLeadContextSchema = z.object({
  source: z.string(),
  owner: z.string(),
  planInterest: z.string(),
  goal: z.string(),
  joinedAt: z.string()
})
export type MemberLeadContextOutput = z.infer<typeof memberLeadContextSchema>

export const membershipDetailsSchema = z.object({
  plan: z.string(),
  purchasedAt: z.string(),
  expiresAt: z.string(),
  amountDueMinor: z.number().int().optional(),
  totalMinor: z.number().int().optional()
})
export type MembershipDetailsOutput = z.infer<typeof membershipDetailsSchema>

export const memberRecordSchema = z.object({
  membership: membershipDetailsSchema,
  lead: memberLeadContextSchema.optional(),
  invoices: z.array(membershipInvoiceSchema)
})
export type MemberRecordOutput = z.infer<typeof memberRecordSchema>

/* -------------------------------------------------------------------------- */
/* Input types (queries)                                                        */
/* -------------------------------------------------------------------------- */

export const memberRecordRequestSchema = z.object({
  memberId: z.string()
})
export type MemberRecordRequest = z.infer<typeof memberRecordRequestSchema>
