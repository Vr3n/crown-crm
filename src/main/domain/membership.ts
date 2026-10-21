/**
 * Customers & Memberships domain (Module 02).
 *
 * Customer is the stable person; each membership row is one purchased entitlement
 * period. Membership status is a cache — ground truth is dates plus freeze records
 * (Module 02 §technical decision). Status transitions are explicit domain operations.
 */

export type MembershipStatus =
  'PENDING' | 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'TERMINATED'

export type FreezeBillingBehavior = 'SUSPEND_BILLING' | 'CONTINUE_BILLING'
export type FreezeAccessBehavior = 'NO_ACCESS' | 'LIMITED_ACCESS'

export type CancellationReasonCode =
  | 'COST'
  | 'RELOCATION'
  | 'HEALTH'
  | 'FACILITIES'
  | 'SERVICE'
  | 'COMPETITOR'
  | 'UNUSED'
  | 'FAMILY'
  | 'OTHER'

export type CancellationTiming = 'IMMEDIATE' | 'END_OF_PERIOD' | 'NOTICE_DAYS'

export type MembershipEventType =
  | 'CREATED'
  | 'ACTIVATED'
  | 'FROZEN'
  | 'UNFROZEN'
  | 'RENEWED'
  | 'PLAN_CHANGED'
  | 'CANCELLATION_REQUESTED'
  | 'CANCELLED'
  | 'CANCELLATION_REVERTED'
  | 'EXPIRED'
  | 'TERMINATED'

export interface Customer {
  id: number
  organizationId: number
  personId: number
  billingName: string | null
  billingPhone: string | null
  billingEmail: string | null
  billingAddress: string | null
  emergencyContact: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface Membership {
  id: number
  organizationId: number
  customerId: number
  planId: number
  offerId: number | null
  planNameSnapshot: string
  durationDaysSnapshot: number
  basePriceMinor: number
  discountMinor: number
  finalPriceMinor: number
  taxRateBps: number
  joiningDate: string
  startDate: string
  endDate: string
  billingFrequency: string
  status: MembershipStatus
  cancellationRequestedAt: string | null
  cancellationEffectiveDate: string | null
  cancellationReason: string | null
  cancellationReasonCode: CancellationReasonCode | null
  createdAt: string
  createdBy: number
}

export interface MembershipFreeze {
  id: number
  organizationId: number
  membershipId: number
  startDate: string
  endDate: string
  reason: string | null
  feeMinor: number
  billingBehavior: FreezeBillingBehavior
  accessBehavior: FreezeAccessBehavior
  extensionDays: number
  creditDays: number
  createdAt: string
  createdBy: number
}

export interface MembershipEvent {
  id: number
  organizationId: number
  membershipId: number
  type: MembershipEventType
  data: string | null
  occurredAt: string
  createdBy: number
}

/**
 * Allowed status transitions (Module 11 §72). Explicit transitions only.
 * EXPIRED is derived from end_date < today and maintained by a reconciliation
 * job — never set by UI code directly.
 */
const ALLOWED_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['FROZEN', 'EXPIRED', 'CANCELLED', 'TERMINATED'],
  FROZEN: ['ACTIVE', 'EXPIRED', 'CANCELLED', 'TERMINATED'],
  EXPIRED: [],
  CANCELLED: [],
  TERMINATED: []
}

/**
 * Validates that a status transition is legal. Throws InvalidStateTransitionError
 * if the transition is not in the allowed map.
 */
export function assertValidTransition(from: MembershipStatus, to: MembershipStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid membership transition: ${from} → ${to}`)
  }
}

/**
 * Derives the "effective" membership status from dates and freeze records.
 * This is the ground truth; the status column is a cache.
 */
export function deriveMembershipStatus(
  startDate: string,
  endDate: string,
  today: string,
  hasActiveFreeze: boolean,
  cancellationEffectiveDate?: string | null
): MembershipStatus {
  if (today < startDate) return 'PENDING'
  if (cancellationEffectiveDate && cancellationEffectiveDate <= today) return 'CANCELLED'
  if (today > endDate) return 'EXPIRED'
  if (hasActiveFreeze) return 'FROZEN'
  return 'ACTIVE'
}

/** Whether a cancellation has been requested but not yet taken effect. */
export function isPendingCancellation(
  cancellationRequestedAt: string | null | undefined,
  cancellationEffectiveDate: string | null | undefined
): boolean {
  return !!(
    cancellationRequestedAt &&
    cancellationEffectiveDate &&
    cancellationEffectiveDate > new Date().toISOString().slice(0, 10)
  )
}

/**
 * Calculates a prorated refund for unused days.
 * refund = paidMinor × (totalDays - usedDays) / totalDays
 */
export function calculateProratedRefund({
  paidMinor,
  usedDays,
  totalDays
}: {
  paidMinor: number
  usedDays: number
  totalDays: number
}): number {
  if (totalDays <= 0 || usedDays >= totalDays) return 0
  if (usedDays <= 0) return paidMinor
  const unusedDays = totalDays - usedDays
  return Math.max(0, Math.min(paidMinor, Math.round((paidMinor * unusedDays) / totalDays)))
}

/**
 * Resolves the effective date from cancellation timing and policy.
 * NOTICE_DAYS uses `noticeDays` (default 14) from today, unless `overrideDate`
 * is provided (staff override); the result is always capped at `endDate` so a
 * cancellation never takes effect after the membership period ends.
 */
export function resolveCancellationEffectiveDate(
  timing: CancellationTiming,
  noticeDays: number | null,
  endDate: string,
  today: string,
  overrideDate?: string | null
): string {
  const cap = (date: string): string => (date > endDate ? endDate : date)
  switch (timing) {
    case 'IMMEDIATE':
      return today
    case 'END_OF_PERIOD':
      return endDate
    case 'NOTICE_DAYS': {
      if (overrideDate) return cap(overrideDate)
      const d = new Date(`${today}T00:00:00`)
      d.setDate(d.getDate() + (noticeDays ?? 14))
      const pad = (n: number): string => String(n).padStart(2, '0')
      return cap(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
    }
  }
}
