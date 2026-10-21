import type { BillingFrequency, MembershipStatus } from '@/features/customers/types'
import type { PersonStatus } from '@/features/people/person-status'

/**
 * Memberships page (Module 02 §6) — a flat, queryable view of every entitlement
 * period across all customers. One row = one purchased membership; history is
 * never overwritten (docs/02 §32).
 */
export interface MembershipRow {
  id: string
  customerId: string
  customerName: string
  personId?: string
  /** Person-level flag — blacklisted people cannot be sold/renewed. */
  isBlacklisted: boolean
  blacklistedReason?: string
  plan: string
  priceMinor: number
  discountMinor: number
  registrationFeeMinor: number
  billingFrequency: BillingFrequency
  startDate: string
  endDate: string
  /** Effective state — derived from dates + open freezes + cancellation (docs/02 §7). */
  status: MembershipStatus
  /** Whether a cancellation has been requested but not yet effective. */
  pendingCancellation: boolean
  /** The effective date of a pending cancellation, if any. */
  cancellationEffectiveDate?: string | null
  freezeCount: number
}

export interface MembershipFilters {
  search: string
  status: MembershipStatus | 'ALL'
  personStatus: 'ALL' | PersonStatus
  plan: string
}
