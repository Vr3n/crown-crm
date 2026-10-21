import type { Customer, CustomerRow, CustomerStatus, Membership, MembershipStatus } from './types'

/**
 * Module 02 read-model derivation (docs/02 §7, docs/09). Nothing here calls
 * Date.now() — "now" is threaded in from a render-pure useNow() so these stay
 * pure functions.
 */

/**
 * Effective membership state = status + dates + open freeze records + cancellation.
 * The cached status column alone is not the source of truth (a stale ACTIVE past its end
 * date, or an ACTIVE during an open freeze, or a scheduled cancellation).
 */
export function effectiveStatus(m: Membership, now: number): MembershipStatus {
  if (m.status === 'ACTIVE' || m.status === 'PENDING') {
    // Pending cancellation that has taken effect → CANCELLED
    if (m.cancellationEffectiveDate && new Date(m.cancellationEffectiveDate).getTime() <= now) {
      return 'CANCELLED'
    }
    const openFreeze = m.freezes.some(
      (f) => new Date(f.startDate).getTime() <= now && new Date(f.endDate).getTime() > now
    )
    if (openFreeze) return 'FROZEN'
    if (new Date(m.endDate).getTime() < now) return 'EXPIRED'
  }
  return m.status
}

/** Whether a cancellation has been requested but not yet taken effect. */
export function isPendingCancellation(m: Membership, now: number): boolean {
  return !!(
    m.cancellationRequestedAt &&
    m.cancellationEffectiveDate &&
    new Date(m.cancellationEffectiveDate).getTime() > now
  )
}

function latestFirst(a: Membership, b: Membership): number {
  return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
}

/** Directory row: derive the customer's relationship to the gym right now. */
export function buildCustomerRow(customer: Customer, now: number): CustomerRow {
  const eff = customer.memberships.map((m) => ({ m, status: effectiveStatus(m, now) }))
  const active = eff.filter((e) => e.status === 'ACTIVE')
  const frozen = eff.filter((e) => e.status === 'FROZEN')

  let status: CustomerStatus
  let currentMembership: Membership | undefined

  if (active.length > 0) {
    status = 'ACTIVE'
    currentMembership = active.map((e) => e.m).sort(latestFirst)[0]
  } else if (frozen.length > 0) {
    status = 'FROZEN'
    currentMembership = frozen.map((e) => e.m).sort(latestFirst)[0]
  } else if (eff.some((e) => e.status === 'PENDING')) {
    status = 'PENDING'
    currentMembership = eff
      .filter((e) => e.status === 'PENDING')
      .map((e) => e.m)
      .sort(latestFirst)[0]
  } else if (customer.memberships.length > 0) {
    status = 'EXPIRED'
  } else {
    status = 'NONE'
  }

  const current = active.length > 0 ? active : frozen
  const nextExpiry = current.length
    ? current.map((e) => e.m).sort((a, b) => a.endDate.localeCompare(b.endDate))[0]!.endDate
    : undefined

  return {
    customer,
    status,
    currentMembership,
    membershipCount: customer.memberships.length,
    nextExpiry
  }
}
