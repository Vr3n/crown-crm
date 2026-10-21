import type { Membership } from '@/features/customers/types'
import type { MembershipExpiration, PaymentDue } from '../types'

const NEUTRAL: Pick<
  Membership,
  'priceMinor' | 'discountMinor' | 'billingFrequency' | 'registrationFeeMinor' | 'status' | 'freezes'
> = {
  priceMinor: 0,
  discountMinor: 0,
  billingFrequency: 'MONTHLY',
  registrationFeeMinor: 0,
  status: 'ACTIVE',
  freezes: []
}

/**
 * Renewal shortcuts from dashboard surfaces (#110).
 *
 * Both builders produce the Membership the RenewMembershipDialog needs.
 * Fields the dialog never reads (prices, status index, freezes) get neutral
 * defaults — the dialog re-derives pricing from the picked plan.
 */

/** Expiration rows always carry renew inputs (backend guarantees them). */
export function expirationToRenewTarget(row: MembershipExpiration): Membership {
  return {
    id: row.id,
    customerId: row.customerId,
    plan: row.plan,
    planId: row.planId ?? undefined,
    ...NEUTRAL,
    joiningDate: row.joiningDate,
    startDate: row.purchasedAt,
    endDate: row.expiresAt,
    createdAt: new Date().toISOString()
  }
}

/**
 * Dues rows carry renew inputs only when the backend resolved a membership.
 * Returns null when unresolvable — callers hide the Renew action instead of
 * guessing (a wrong source membership would misattribute the renewal).
 */
export function paymentToRenewTarget(row: PaymentDue): Membership | null {
  if (!row.membershipId) return null
  return {
    id: row.membershipId,
    customerId: row.customerId,
    plan: row.plan,
    planId: row.renewPlanId ?? undefined,
    ...NEUTRAL,
    joiningDate: row.joiningDate,
    startDate: row.planStartDate,
    endDate: row.planEndDate,
    createdAt: new Date().toISOString()
  }
}
