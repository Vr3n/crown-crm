import type { CustomerFilters, CustomerRow, CustomerStatus } from './types'

/**
 * Directory filters: free-text search across identity + plans, a derived status
 * bucket, plan and owner selects. Rows arrive already carrying their derived
 * status, so this is a pure comparison over the read model.
 */
export function filterCustomers(rows: CustomerRow[], filters: CustomerFilters): CustomerRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    const c = row.customer
    if (filters.status !== 'ALL' && row.status !== filters.status) return false
    if (filters.personStatus !== 'ALL') {
      const isBlacklisted = filters.personStatus === 'BLACKLISTED'
      if (c.isBlacklisted !== isBlacklisted) return false
    }
    if (filters.plan !== 'ALL' && !c.memberships.some((m) => m.plan === filters.plan)) return false
    if (filters.ownerId !== 'ALL' && c.ownerId !== filters.ownerId) return false
    if (q) {
      const hay = [c.id, c.name, c.phone, c.email, ...c.memberships.map((m) => m.plan)]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Directory default order: active first, then by expiry date. */
export function sortCustomerRows(rows: CustomerRow[]): CustomerRow[] {
  const rank: Record<CustomerStatus, number> = {
    ACTIVE: 0,
    FROZEN: 1,
    PENDING: 2,
    EXPIRED: 3,
    NONE: 4
  }
  return [...rows].sort((a, b) => {
    const d = rank[a.status] - rank[b.status]
    if (d !== 0) return d
    if (a.nextExpiry && b.nextExpiry) return a.nextExpiry.localeCompare(b.nextExpiry)
    return a.customer.name.localeCompare(b.customer.name)
  })
}
