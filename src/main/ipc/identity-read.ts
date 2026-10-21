import { and, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  organizations,
  organizationStaff,
  users,
  roles,
  rolePermissions,
  permissions
} from '../db/schema'
import { currentOrganizationId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Identity IPC handlers for reading/updating organization, staff, and roles.
 * Returns data in the renderer's expected shapes.
 */

interface OrgRow {
  id: number
  slug: string
  name: string
  legal_name: string | null
  billing_email: string | null
  mobile_number: string
  timezone: string | null
  currency: string
  logo: string | null
  status: string
  plan_tier: string | null
  invoice_terms: string | null
  receipt_terms: string | null
  refund_terms: string | null
  created_at: string
}

interface UserRow {
  id: number
  full_name: string
  email: string
  status: string
}

interface RoleRow {
  id: number
  name: string
  description: string | null
  is_system_role: boolean
  is_super: boolean
}

interface StaffRow {
  id: number
  user_id: number
  role_id: number
  status: string
  joined_at: string
}

export function registerIdentityReadIpc(): void {
  handle(IPC_CHANNELS.IDENTITY_ORGANIZATION, () => {
    const organizationId = currentOrganizationId()
    const row = getDrizzle()
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .get() as OrgRow | undefined
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      legalName: row.legal_name,
      billingEmail: row.billing_email,
      mobileNumber: row.mobile_number,
      timezone: row.timezone,
      currency: row.currency,
      logo: row.logo ?? null,
      status: row.status,
      planTier: row.plan_tier,
      invoiceTerms: row.invoice_terms,
      receiptTerms: row.receipt_terms,
      refundTerms: row.refund_terms,
      createdAt: row.created_at
    }
  })

  handle(IPC_CHANNELS.IDENTITY_STAFF, () => {
    const organizationId = currentOrganizationId()

    const staffRows = getDrizzle()
      .select()
      .from(organizationStaff)
      .where(eq(organizationStaff.organization_id, organizationId))
      .all() as StaffRow[]

    if (staffRows.length === 0) return []

    const userIds = staffRows.map((s) => s.user_id)
    const userRows = getDrizzle()
      .select()
      .from(users)
      .where(
        sql`${users.id} IN (${sql.join(
          userIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .all() as UserRow[]
    const userMap = new Map(userRows.map((u) => [u.id, u]))

    const roleIds = [...new Set(staffRows.map((s) => s.role_id))]
    const roleRows = getDrizzle()
      .select()
      .from(roles)
      .where(
        sql`${roles.id} IN (${sql.join(
          roleIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
      .all() as RoleRow[]
    const roleMap = new Map(roleRows.map((r) => [r.id, r]))

    return staffRows.map((s) => {
      const user = userMap.get(s.user_id)
      const role = roleMap.get(s.role_id)
      return {
        id: String(s.id),
        userId: s.user_id,
        fullName: user?.full_name ?? 'Unknown',
        email: user?.email ?? '',
        roleId: String(s.role_id),
        roleName: role?.name ?? 'Unknown',
        isSuper: role?.is_super ?? false,
        isSystemRole: role?.is_system_role ?? false,
        status: s.status as 'ACTIVE' | 'INVITED' | 'DISABLED',
        joinedAt: s.joined_at
      }
    })
  })

  handle(IPC_CHANNELS.IDENTITY_ROLES, () => {
    const organizationId = currentOrganizationId()

    const roleRows = getDrizzle()
      .select()
      .from(roles)
      .where(eq(roles.organization_id, organizationId))
      .all() as RoleRow[]

    return roleRows.map((r) => {
      // Get permission codes for this role
      let permissionCodes: string[] = []
      if (r.is_super) {
        const allPerms = getDrizzle().select({ code: permissions.code }).from(permissions).all()
        permissionCodes = allPerms.map((p) => p.code)
      } else {
        const perms = getDrizzle()
          .select({ code: permissions.code })
          .from(permissions)
          .innerJoin(rolePermissions, eq(rolePermissions.permission_id, permissions.id))
          .where(eq(rolePermissions.role_id, r.id))
          .all()
        permissionCodes = perms.map((p) => p.code)
      }

      // Count staff with this role
      const staffCount = getDrizzle()
        .select({ n: sql<number>`count(*)` })
        .from(organizationStaff)
        .where(
          and(
            eq(organizationStaff.organization_id, organizationId),
            eq(organizationStaff.role_id, r.id)
          )
        )
        .get()

      return {
        id: String(r.id),
        name: r.name,
        description: r.description,
        isSystemRole: r.is_system_role,
        isSuper: r.is_super,
        permissionCodes,
        memberCount: staffCount?.n ?? 0
      }
    })
  })
}
