import { and, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { companies, companyUsers, users, roles, rolePermissions, permissions } from '../db/schema'
import { currentCompanyId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Identity IPC handlers for reading/updating company, staff, and roles.
 * Returns data in the renderer's expected shapes.
 */

interface CompanyRow {
  id: number
  slug: string
  name: string
  legal_name: string | null
  gstin: string | null
  pan: string | null
  state_code: string
  address: string | null
  city: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  currency: string
  fy_start_month: number
  books_begin_date: string
  invoice_terms: string | null
  costing_method: string
  round_off_mode: string
  allow_negative_stock: boolean
  status: string
  numbering_setup_at: string | null
  onboarding_completed_at: string | null
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
  handle(IPC_CHANNELS.IDENTITY_COMPANY, () => {
    const companyId = currentCompanyId()
    const row = getDrizzle().select().from(companies).where(eq(companies.id, companyId)).get() as
      CompanyRow | undefined
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      legalName: row.legal_name,
      gstin: row.gstin,
      pan: row.pan,
      stateCode: row.state_code,
      address: row.address,
      city: row.city,
      pincode: row.pincode,
      phone: row.phone,
      email: row.email,
      currency: row.currency,
      fyStartMonth: row.fy_start_month,
      booksBeginDate: row.books_begin_date,
      invoiceTerms: row.invoice_terms,
      costingMethod: row.costing_method,
      roundOffMode: row.round_off_mode,
      allowNegativeStock: row.allow_negative_stock,
      status: row.status,
      numberingSetupAt: row.numbering_setup_at,
      onboardingCompletedAt: row.onboarding_completed_at
    }
  })
  handle(IPC_CHANNELS.IDENTITY_STAFF, () => {
    const companyId = currentCompanyId()

    const staffRows = getDrizzle()
      .select()
      .from(companyUsers)
      .where(eq(companyUsers.company_id, companyId))
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
    const companyId = currentCompanyId()

    const roleRows = getDrizzle()
      .select()
      .from(roles)
      .where(eq(roles.company_id, companyId))
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
        .from(companyUsers)
        .where(and(eq(companyUsers.company_id, companyId), eq(companyUsers.role_id, r.id)))
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
