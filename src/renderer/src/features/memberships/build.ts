import { effectiveStatus, isPendingCancellation } from '@/features/customers/build'
import type { Customer } from '@/features/customers/types'
import type { MembershipRow } from './types'

/**
 * Flatten every customer's membership history into one entitlement list. The
 * effective status is derived at build time with an explicit `now` so the
 * memberships table never trusts a stale cached status column.
 */
export function buildMembershipRows(customers: Customer[], now: number): MembershipRow[] {
  return customers.flatMap((c) =>
    c.memberships.map((m) => ({
      id: m.id,
      customerId: c.id,
      customerName: c.name,
      personId: c.personId,
      isBlacklisted: c.isBlacklisted,
      blacklistedReason: c.blacklistedReason,
      plan: m.plan,
      priceMinor: m.priceMinor,
      discountMinor: m.discountMinor,
      registrationFeeMinor: m.registrationFeeMinor,
      billingFrequency: m.billingFrequency,
      startDate: m.startDate,
      endDate: m.endDate,
      status: effectiveStatus(m, now),
      pendingCancellation: isPendingCancellation(m, now),
      cancellationEffectiveDate: m.cancellationEffectiveDate,
      freezeCount: m.freezes.length
    }))
  )
}

/** Open entitlements first, then by end date (soonest expiring at the top). */
export function sortMembershipRows(rows: MembershipRow[]): MembershipRow[] {
  const active = ['ACTIVE', 'FROZEN', 'PENDING'] as const
  return [...rows].sort((a, b) => {
    const ar = active.includes(a.status as (typeof active)[number]) ? 0 : 1
    const br = active.includes(b.status as (typeof active)[number]) ? 0 : 1
    if (ar !== br) return ar - br
    if (ar === 0) return a.endDate.localeCompare(b.endDate)
    return b.endDate.localeCompare(a.endDate)
  })
}
