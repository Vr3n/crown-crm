/**
 * Module 02 — Customer Identity & Membership Lifecycle types.
 *
 * The domain rule that drives this whole feature (docs/02 §7): a Membership row
 * is ONE purchased entitlement period, never overwritten on renewal. A customer
 * is the stable person who holds any number of these rows — including expired
 * ones, so history is never erased. `status` is a cached index; the effective
 * state is derived from dates + open freezes.
 */
import type { PersonStatus } from '../people/person-status'

export type MembershipStatus =
  'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED'

export type BillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL'

export type FreezeBillingBehavior = 'SUSPEND_BILLING' | 'CONTINUE_BILLING'
export type FreezeAccessBehavior = 'NO_ACCESS' | 'ACCESS'

export interface MembershipFreeze {
  id: string
  membershipId: string
  startDate: string
  endDate: string
  reason: string
  /** Gym-defined fee for this freeze (policy, not logic). */
  feeMinor: number
  billingBehavior: FreezeBillingBehavior
  accessBehavior: FreezeAccessBehavior
  /** Days the membership end date was pushed out. */
  extensionDays: number
  createdAt: string
  createdBy?: string
}

export interface Membership {
  id: string
  customerId: string
  /** plan_name_snapshot — never recomputed from the plan, prices change. */
  plan: string
  planId?: string
  priceMinor: number
  discountMinor: number
  billingFrequency: BillingFrequency
  registrationFeeMinor: number
  /** Joining date (memberships.joining_date) — the day the person joined. */
  joiningDate?: string | null
  startDate: string
  endDate: string
  /** Cached index; the UI derives the effective state via effectiveStatus(). */
  status: MembershipStatus
  /** Cancellation fields */
  cancellationRequestedAt?: string | null
  cancellationEffectiveDate?: string | null
  cancellationReason?: string | null
  cancellationReasonCode?: string | null
  freezes: MembershipFreeze[]
  /** This membership's billed invoices — total/paid/outstanding (minor units). */
  invoices?: { id: string; invoiceNo: string; status: string; issuedAt: string; totalMinor: number; paidMinor: number; outstandingMinor: number }[]
  createdAt: string
  createdBy?: string
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  dateOfBirth?: string
  gender?: string
  address?: string
  emergencyContact?: string
  notes?: string
  /** Link back to the converted lead, when born out of one (Module 01). */
  leadId?: string
  source?: string
  ownerId?: string
  ownerName?: string
  /** Person ID — used for photo and blacklist operations. */
  personId?: string
  /** Person-level flag — blacklisted customers cannot renew/buy. */
  isBlacklisted: boolean
  /** Optional reason recorded when the person was blacklisted. */
  blacklistedReason?: string
  /** First membership purchase - the day the commercial relationship started. */
  joinedAt: string
  createdAt: string
  updatedAt?: string
  memberships: Membership[]
  /** Finalized invoices (Module 04) — present on the detail read model. */
  invoices?: CustomerInvoice[]
}

/** One invoice in minor units — paid/outstanding derived from allocations. */
export interface CustomerInvoice {
  id: string
  invoiceNo: string
  status: 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'
  issuedAt: string
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
}

/**
 * Directory-level status: Customer ≠ Active Member (docs/02 §4), so the
 * directory shows the derived relationship to the gym today.
 */
export type CustomerStatus = 'ACTIVE' | 'FROZEN' | 'PENDING' | 'EXPIRED' | 'NONE'

/** Flat directory row — carries the "now" derivation for the table. */
export interface CustomerRow {
  customer: Customer
  status: CustomerStatus
  /** The current entitlement to highlight in the directory (active or frozen). */
  currentMembership?: Membership
  membershipCount: number
  nextExpiry?: string
}

export interface CustomerFilters {
  search: string
  status: CustomerStatus | 'ALL'
  personStatus: 'ALL' | PersonStatus
  plan: string
  ownerId: string
}
