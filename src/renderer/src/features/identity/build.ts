import { PERMISSION_GROUPS } from './constants'
import type { PermissionGroup, Role, StaffMember } from './types'

/**
 * Derived identity read models (Module 14/15). Everything is computed from the
 * source rows — member counts, permission sets, status tallies — so the admin
 * screens never hold hand-maintained counters that can drift from the truth.
 * Super roles short-circuit to "all codes", exactly like the command layer's
 * `requirePermission` (Module 15: check codes, never role names).
 */

/** Every permission code in the catalog, in seed order. */
export function allPermissionCodes(): string[] {
  return PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.code))
}

/** The codes a role effectively grants (super roles grant everything). */
export function effectivePermissionCodes(role: Role): string[] {
  return role.isSuper ? allPermissionCodes() : role.permissionCodes
}

/** Count of granted permissions for a role. */
export function grantedCount(role: Role): number {
  return effectivePermissionCodes(role).length
}

/** Active staff members. */
export function activeStaff(staff: StaffMember[]): StaffMember[] {
  return staff.filter((s) => s.status === 'ACTIVE')
}

/** Staff members whose role is super (Owner/Admin). */
export function superStaff(staff: StaffMember[]): StaffMember[] {
  return staff.filter((s) => s.isSuper)
}

/** Per-role headcount, for the roles table + role drawer. */
export function memberCountByRole(roles: Role[], staff: StaffMember[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const role of roles) counts.set(role.id, 0)
  for (const s of staff) {
    const current = counts.get(s.roleId) ?? 0
    counts.set(s.roleId, current + 1)
  }
  return counts
}

/**
 * The permission catalog with each role's grant state marked — the editor view
 * for the role drawer. A single group with zero granted rows is collapsed.
 */
export function permissionGroupsFor(role: Role): PermissionGroup[] {
  const effective = new Set(effectivePermissionCodes(role))
  return PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: group.permissions.map((p) => ({ ...p }))
  })).filter((group) => group.permissions.some((p) => effective.has(p.code)))
}

/** True when a role can be renamed (system roles are locked). */
export function isRoleEditable(role: Role): boolean {
  return !role.isSystemRole
}

/** True when a staff member is the org's root Owner — never demotable/removable. */
export function isOwner(staff: StaffMember): boolean {
  return staff.isSuper && staff.roleName === 'Owner'
}
