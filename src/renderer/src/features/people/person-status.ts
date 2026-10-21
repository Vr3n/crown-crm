/**
 * Person status — a renderer-derived concept, not a stored column.
 *
 * Following the `CustomerStatus` precedent (buildCustomerRow derives status
 * client-side), a person's status is computed from the flags the read model
 * already carries. Today blacklisting is the only person-level state, so
 * `isBlacklisted` is the sole input; the union is the extension point if more
 * person states ever appear. Kept in one shared module so the Leads, Customers
 * and Memberships filter bars agree on labels and never drift.
 */

export type PersonStatus = 'ACTIVE' | 'BLACKLISTED'

/** Derives a person's status from their blacklist flag (pure). */
export function personStatusOf(isBlacklisted: boolean): PersonStatus {
  return isBlacklisted ? 'BLACKLISTED' : 'ACTIVE'
}

/** Shared filter options: All states / Active / Blacklisted. */
export const PERSON_STATUS_OPTIONS: { value: 'ALL' | PersonStatus; label: string }[] = [
  { value: 'ALL', label: 'All states' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'BLACKLISTED', label: 'Blacklisted' }
]