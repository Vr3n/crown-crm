import type { Membership } from './types'

/**
 * Per-membership billing totals, aggregated from the membership's invoices
 * (total / paid / outstanding in minor units). Membership invoices attach via
 * the invoice→membership FK set at sale/renew. Empty/legacy memberships with
 * no linked invoices report zeros — callers should render a "—" for those.
 */
export function membershipBillingTotals(membership: Membership): {
  totalMinor: number
  paidMinor: number
  outstandingMinor: number
} {
  const invoices = membership.invoices ?? []
  let totalMinor = 0
  let paidMinor = 0
  let outstandingMinor = 0
  for (const inv of invoices) {
    totalMinor += inv.totalMinor
    paidMinor += inv.paidMinor
    outstandingMinor += inv.outstandingMinor
  }
  return { totalMinor, paidMinor, outstandingMinor }
}