/**
 * Identity & tenancy read models (Module 14 · Organization, Module 15 · RBAC).
 *
 * Mirrors the main-process domain in `src/main/domain/identity.ts` so the UI
 * reads exactly what the future IPC layer will return — identity is one app-level
 * User row per login, with membership in an Organization expressed through
 * OrganizationStaff (the role assignment), never a column on the user row.
 */

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL'
export type StaffStatus = 'ACTIVE' | 'INVITED' | 'DISABLED'

/** Module 14 — the tenant every business table hangs off. */
export interface OrganizationProfile {
  id: number
  slug: string
  name: string
  legalName: string | null
  billingEmail: string | null
  mobileNumber: string
  timezone: string | null
  currency: string
  /** Stored logo filename (logos/{orgId}/{uuid}.ext), or null. Display via useOrgLogo(). */
  logo?: string | null
  status: OrgStatus
  planTier: string | null
  /** Free-text T&C printed on Invoice Document footers (live-read on print). */
  invoiceTerms: string | null
  /** Free-text T&C printed on Payment Receipt footers (live-read on print). */
  receiptTerms: string | null
  /** Free-text T&C printed on Refund Receipt footers (live-read on print). */
  refundTerms: string | null
  createdAt: string
}

/** A staff member within the organization — a User + its OrganizationStaff row. */
export interface StaffMember {
  id: string
  userId: number
  fullName: string
  email: string
  roleId: string
  roleName: string
  /** True when the assigned role is Owner/Admin (is_super) — informs guarding. */
  isSuper: boolean
  /** True when the assigned role is a seeded, non-removable system role. */
  isSystemRole: boolean
  status: StaffStatus
  joinedAt: string
}

/** Module 15 — a named bundle of permissions, scoped to one Organization. */
export interface Role {
  id: string
  name: string
  description: string | null
  isSystemRole: boolean
  isSuper: boolean
  /** The permission codes this role grants (its RolePermission rows). */
  permissionCodes: string[]
  /** Staff headcount for the role, derived at render time by the page. */
  memberCount?: number
}

/** A group of permissions for the catalog (e.g. "Sales", "Billing"). */
export interface PermissionGroup {
  id: string
  label: string
  permissions: PermissionItem[]
}

export interface PermissionItem {
  code: string
  label: string
  description: string
}
