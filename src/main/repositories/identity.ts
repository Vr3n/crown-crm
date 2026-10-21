import { and, count, eq, exists, or, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  appMeta,
  organizationStaff,
  organizations,
  permissions,
  rolePermissions,
  roles,
  users
} from '../db/schema'
import {
  Organization,
  User,
  Role,
  OrganizationStaff,
  OrgStatus,
  UserStatus
} from '../domain/identity'

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
  status: OrgStatus
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
  password_hash: string
  status: UserStatus
  created_at: string
}

interface RoleRow {
  id: number
  organization_id: number
  name: string
  is_system_role: boolean
  is_super: boolean
  description: string | null
}

interface StaffRow {
  id: number
  organization_id: number
  user_id: number
  role_id: number
  status: OrganizationStaff['status']
  joined_at: string
}

function mapOrg(row: OrgRow): Organization {
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
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    createdAt: row.created_at
  }
}

function mapRole(row: RoleRow): Role {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    isSystemRole: row.is_system_role,
    isSuper: row.is_super,
    description: row.description
  }
}

function mapStaff(row: StaffRow): OrganizationStaff {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status,
    joinedAt: row.joined_at
  }
}

export const organizationRepo = {
  create(input: {
    slug: string
    name: string
    mobileNumber: string
    legalName?: string | null
    billingEmail?: string | null
    timezone?: string | null
    currency: string
  }): Organization {
    const db = getDrizzle()
    const row = db
      .insert(organizations)
      .values({
        slug: input.slug,
        name: input.name,
        mobile_number: input.mobileNumber,
        legal_name: input.legalName ?? null,
        billing_email: input.billingEmail ?? null,
        timezone: input.timezone ?? null,
        currency: input.currency
      })
      .returning()
      .get()
    return mapOrg(row as OrgRow)
  },

  findById(id: number): Organization | null {
    const row = getDrizzle().select().from(organizations).where(eq(organizations.id, id)).get() as
      OrgRow | undefined
    return row ? mapOrg(row) : null
  },

  /**
   * Updates the organization profile and terms. Only keys present in `input`
   * are written — omitted fields keep their stored values, while an explicit
   * `null` clears the column (a cleared terms field drops its footer block).
   * Only the current org row is touched — never invoice lines, snapshots, or
   * any financial history.
   */
  update(
    organizationId: number,
    input: {
      legalName?: string | null
      billingEmail?: string | null
      mobileNumber?: string
      timezone?: string | null
      currency?: string
      invoiceTerms?: string | null
      receiptTerms?: string | null
      refundTerms?: string | null
    }
  ): Organization | null {
    const set: {
      legal_name?: string | null
      billing_email?: string | null
      mobile_number?: string
      timezone?: string | null
      currency?: string
      invoice_terms?: string | null
      receipt_terms?: string | null
      refund_terms?: string | null
    } = {}
    if (input.legalName !== undefined) set.legal_name = input.legalName
    if (input.billingEmail !== undefined) set.billing_email = input.billingEmail
    if (input.mobileNumber !== undefined) set.mobile_number = input.mobileNumber
    if (input.timezone !== undefined) set.timezone = input.timezone
    if (input.currency !== undefined) set.currency = input.currency
    if (input.invoiceTerms !== undefined) set.invoice_terms = input.invoiceTerms
    if (input.receiptTerms !== undefined) set.receipt_terms = input.receiptTerms
    if (input.refundTerms !== undefined) set.refund_terms = input.refundTerms
    if (Object.keys(set).length === 0) return this.findById(organizationId)
    const row = getDrizzle()
      .update(organizations)
      .set(set)
      .where(eq(organizations.id, organizationId))
      .returning()
      .get() as OrgRow | undefined
    return row ? mapOrg(row) : null
  },

  findLogoFilename(organizationId: number): string | null {
    const row = getDrizzle()
      .select({ logo: organizations.logo })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .get()
    return row?.logo ?? null
  },

  updateLogo(organizationId: number, logo: string | null): void {
    getDrizzle()
      .update(organizations)
      .set({ logo })
      .where(eq(organizations.id, organizationId))
      .run()
  },

  findAll(): Organization[] {
    const rows = getDrizzle()
      .select()
      .from(organizations)
      .orderBy(organizations.id)
      .all() as unknown as OrgRow[]
    return rows.map(mapOrg)
  },

  count(): number {
    const row = getDrizzle().select({ n: count() }).from(organizations).get()
    return row?.n ?? 0
  },

  /**
   * True when an organization already exists under this name AND (the given
   * email belongs to its owner/super member OR the given mobile matches the
   * organization's stored mobile). Backs the setup screen's "organization
   * already exists" validation. `email` should be lowercased and `mobile` a
   * bare 10-digit string by the caller. Like other uniqueness rules in this
   * module it is enforced in code, not by a DB constraint.
   */
  existsWithOwnerCredentials(input: { name: string; email: string; mobile: string }): boolean {
    const db = getDrizzle()
    const superMember = db
      .select({ id: organizationStaff.id })
      .from(organizationStaff)
      .innerJoin(users, eq(users.id, organizationStaff.user_id))
      .innerJoin(roles, eq(roles.id, organizationStaff.role_id))
      .where(
        and(
          eq(organizationStaff.organization_id, organizations.id),
          eq(roles.is_super, true),
          eq(sql`lower(${users.email})`, input.email)
        )
      )

    const row = db
      .select({ x: sql`1` })
      .from(organizations)
      .where(
        and(
          eq(organizations.name, input.name),
          or(eq(organizations.mobile_number, input.mobile), exists(superMember))
        )
      )
      .get()
    return Boolean(row)
  }
}

export const userRepo = {
  create(input: { fullName: string; email: string; passwordHash: string }): User {
    const db = getDrizzle()
    const row = db
      .insert(users)
      .values({
        full_name: input.fullName,
        email: input.email,
        password_hash: input.passwordHash
      })
      .returning()
      .get()
    return mapUser(row as UserRow)
  },

  findById(id: number): User | null {
    const row = getDrizzle().select().from(users).where(eq(users.id, id)).get() as
      UserRow | undefined
    return row ? mapUser(row) : null
  }
}

export const roleRepo = {
  findByName(organizationId: number, name: string): Role | null {
    const row = getDrizzle()
      .select()
      .from(roles)
      .where(and(eq(roles.organization_id, organizationId), eq(roles.name, name)))
      .get() as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  /** Resolves the permission codes a role grants. Super roles return all known codes. */
  findPermissionCodes(roleId: number): string[] {
    const db = getDrizzle()
    const role = db.select().from(roles).where(eq(roles.id, roleId)).get() as RoleRow | undefined
    if (!role) return []
    if (role.is_super) {
      const rows = db.select({ code: permissions.code }).from(permissions).all()
      return rows.map((r) => r.code)
    }
    const rows = db
      .select({ code: permissions.code })
      .from(permissions)
      .innerJoin(rolePermissions, eq(rolePermissions.permission_id, permissions.id))
      .where(eq(rolePermissions.role_id, roleId))
      .all()
    return rows.map((r) => r.code)
  }
}

/** Simple key/value store for app-level settings (e.g. the remembered login). */
export const appMetaRepo = {
  get(key: string): string | null {
    const row = getDrizzle()
      .select({ value: appMeta.value })
      .from(appMeta)
      .where(eq(appMeta.key, key))
      .get()
    return row ? row.value : null
  },

  set(key: string, value: string): void {
    getDrizzle()
      .insert(appMeta)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value }
      })
      .run()
  },

  delete(key: string): void {
    getDrizzle().delete(appMeta).where(eq(appMeta.key, key)).run()
  }
}

export const staffRepo = {
  /** Uniqueness of (organization_id, email) is enforced here, per the spec. */
  emailExistsInOrganization(organizationId: number, email: string): boolean {
    const row = getDrizzle()
      .select({ x: sql`1` })
      .from(organizationStaff)
      .innerJoin(users, eq(users.id, organizationStaff.user_id))
      .where(
        and(
          eq(organizationStaff.organization_id, organizationId),
          eq(sql`lower(${users.email})`, email)
        )
      )
      .get()
    return Boolean(row)
  },

  create(input: { organizationId: number; userId: number; roleId: number }): OrganizationStaff {
    const db = getDrizzle()
    const row = db
      .insert(organizationStaff)
      .values({
        organization_id: input.organizationId,
        user_id: input.userId,
        role_id: input.roleId
      })
      .returning()
      .get()
    return mapStaff(row as StaffRow)
  },

  findById(id: number): OrganizationStaff | null {
    const row = getDrizzle()
      .select()
      .from(organizationStaff)
      .where(eq(organizationStaff.id, id))
      .get() as StaffRow | undefined
    return row ? mapStaff(row) : null
  },

  /** The active staff membership for a user within an organization, with role + user. */
  findActiveForLogin(
    organizationId: number,
    email: string
  ): {
    user: User
    role: Role
  } | null {
    const row = getDrizzle()
      .select({
        u_id: users.id,
        u_full_name: users.full_name,
        u_email: users.email,
        u_password_hash: users.password_hash,
        u_status: users.status,
        u_created_at: users.created_at,
        r_id: roles.id,
        r_organization_id: roles.organization_id,
        r_name: roles.name,
        r_is_system_role: roles.is_system_role,
        r_is_super: roles.is_super,
        r_description: roles.description
      })
      .from(organizationStaff)
      .innerJoin(users, eq(users.id, organizationStaff.user_id))
      .innerJoin(roles, eq(roles.id, organizationStaff.role_id))
      .where(
        and(
          eq(organizationStaff.organization_id, organizationId),
          eq(organizationStaff.status, 'ACTIVE'),
          eq(users.status, 'ACTIVE'),
          eq(sql`lower(${users.email})`, email)
        )
      )
      .get()
    if (!row) return null
    return {
      user: {
        id: row.u_id,
        fullName: row.u_full_name,
        email: row.u_email,
        passwordHash: row.u_password_hash,
        status: row.u_status as UserStatus,
        createdAt: row.u_created_at
      },
      role: {
        id: row.r_id,
        organizationId: row.r_organization_id,
        name: row.r_name,
        isSystemRole: row.r_is_system_role,
        isSuper: row.r_is_super,
        description: row.r_description
      }
    }
  },

  /**
   * The ACTIVE membership for a specific (organization, user) pair — used to
   * restore a remembered login. One joined query: it only returns a row when the
   * organization, the user, AND the membership are all ACTIVE. A single query
   * avoids the TOCTOU gap of separate lookups and degrades gracefully to `null`
   * whether a row is disabled or deleted outright.
   */
  findActiveMembership(
    organizationId: number,
    userId: number
  ): {
    roleId: number
    roleName: string
    isSuper: boolean
  } | null {
    const row = getDrizzle()
      .select({
        roleId: roles.id,
        roleName: roles.name,
        isSuper: roles.is_super
      })
      .from(organizationStaff)
      .innerJoin(users, eq(users.id, organizationStaff.user_id))
      .innerJoin(roles, eq(roles.id, organizationStaff.role_id))
      .innerJoin(organizations, eq(organizations.id, organizationStaff.organization_id))
      .where(
        and(
          eq(organizationStaff.organization_id, organizationId),
          eq(organizationStaff.user_id, userId),
          eq(organizationStaff.status, 'ACTIVE'),
          eq(users.status, 'ACTIVE'),
          eq(organizations.status, 'ACTIVE')
        )
      )
      .get()
    if (!row) return null
    return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper }
  }
}
