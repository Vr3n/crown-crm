import type { MembershipFilters, MembershipRow } from './types'

/**
 * Membership filters: free-text search (member name, ID or plan) plus status and
 * plan selects. Rows already carry their derived status, so this is a pure
 * comparison over the read model.
 */
export function filterMemberships(
  rows: MembershipRow[],
  filters: MembershipFilters
): MembershipRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.status !== 'ALL' && row.status !== filters.status) return false
    if (filters.personStatus !== 'ALL') {
      const isBlacklisted = filters.personStatus === 'BLACKLISTED'
      if (row.isBlacklisted !== isBlacklisted) return false
    }
    if (filters.plan !== 'ALL' && row.plan !== filters.plan) return false
    if (q) {
      const hay = `${row.id} ${row.customerName} ${row.customerId} ${row.plan}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
