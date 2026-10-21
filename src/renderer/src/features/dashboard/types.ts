/**
 * Dashboard read-model domain types.
 *
 * These are *presentational* aggregates derived for the operational dashboard
 * (Module 09 §58): expiring memberships, unpaid dues and cold leads. The real
 * system would build them as read models over the transactional Module 01–05
 * tables. Until those exist, this is a frontend-only prototype: the mock
 * store stands in for the future SQLite-backed query layer.
 *
 * Members / memberships / payments belong to Module 02–05 (not yet built), so
 * the member-facing rows are seeded mock data; leads are read from the
 * existing `features/leads` store.
 */

/** Minimal person reference shown in member-facing tables. */
export interface PersonRef {
  id: string
  name: string
  personId?: string
  phone?: string
  email?: string
}

/** A membership about to expire — drives renewal follow-ups. */
export interface MembershipExpiration {
  id: string
  member: PersonRef
  plan: string
  purchasedAt: string
  expiresAt: string
  /** Renewal shortcut (#110): direct renew-dialog inputs. */
  customerId: string
  planId: string | null
  joiningDate: string
}

/** An unpaid obligation — drives collection follow-ups. */
export interface PaymentDue {
  id: string
  member: PersonRef
  plan: string
  purchasedAt: string
  amountDueMinor: number
  totalMinor: number
  invoiceNumber: string
  planStartDate: string
  planEndDate: string
  joiningDate: string
  membershipAmountMinor: number
  membershipPurchasedAt: string
  /** Renewal shortcut (#110, Phase 2). Null membership/plan → hide Renew. */
  customerId: string
  membershipId: string | null
  renewPlanId: string | null
}

/** Settlement state of a membership invoice. */
export type InvoiceStatus = 'PAID' | 'OVERDUE'

/** A single billing record within a membership term. */
export interface MembershipInvoice {
  id: string
  invoiceNo: string
  label: string
  periodStart: string
  periodEnd: string
  amountMinor: number
  status: InvoiceStatus
  paidAt?: string
}

/** Sales snapshot of a member — the lead they converted from (Module 01 → 02 link). */
export interface MemberLeadContext {
  source: string
  owner: string
  planInterest: string
  goal: string
  joinedAt: string
}

/** Membership context shown in the record drawer. */
export interface MembershipDetails {
  plan: string
  purchasedAt: string
  expiresAt: string
  amountDueMinor?: number
  totalMinor?: number
}

/** Read model for the member record drawer (Membership → Lead → Invoices). */
export interface MemberRecord {
  membership: MembershipDetails
  lead?: MemberLeadContext
  invoices: MembershipInvoice[]
}
