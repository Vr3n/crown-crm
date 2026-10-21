import type { Role, StaffMember, StaffStatus } from './types'

/**
 * Identity list filters, run upstream of the tables so search stays snappy (the
 * DataTable handles sorting + pagination on the filtered set).
 */

export interface StaffFilters {
  search: string
  roleId: string | 'ALL'
  status: StaffStatus | 'ALL'
}

export function filterStaff(rows: StaffMember[], f: StaffFilters): StaffMember[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((s) => {
    if (f.roleId !== 'ALL' && s.roleId !== f.roleId) return false
    if (f.status !== 'ALL' && s.status !== f.status) return false
    if (q) {
      const hay = `${s.fullName} ${s.email} ${s.roleName}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function filterRoles(rows: Role[], search: string): Role[] {
  const q = search.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => `${r.name} ${r.description ?? ''}`.toLowerCase().includes(q))
}
