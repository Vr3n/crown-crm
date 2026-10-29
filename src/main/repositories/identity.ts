import { and, count, eq, exists, inArray, ne, or, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  appMeta,
  companyUsers,
  companies,
  permissions,
  rolePermissions,
  roles,
  users
} from '../db/schema'
import { Company, User, Role, CompanyStaff, CompanyStatus, UserStatus } from '../domain/identity'

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
  logo: string | null
  invoice_terms: string | null
  costing_method: string
  round_off_mode: string
  allow_negative_stock: boolean
  status: CompanyStatus
  numbering_setup_at: string | null
  onboarding_completed_at: string | null
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
  company_id: number
  name: string
  is_system_role: boolean
  is_super: boolean
  description: string | null
}

interface StaffRow {
  id: number
  company_id: number
  user_id: number
  role_id: number
  status: CompanyStaff['status']
  joined_at: string
}

function mapCompany(row: CompanyRow): Company {
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
    logo: row.logo,
    invoiceTerms: row.invoice_terms,
    costingMethod: row.costing_method as Company['costingMethod'],
    roundOffMode: row.round_off_mode as Company['roundOffMode'],
    allowNegativeStock: row.allow_negative_stock,
    status: row.status,
    numberingSetupAt: row.numbering_setup_at,
    onboardingCompletedAt: row.onboarding_completed_at
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
    companyId: row.company_id,
    name: row.name,
    isSystemRole: row.is_system_role,
    isSuper: row.is_super,
    description: row.description
  }
}

function mapStaff(row: StaffRow): CompanyStaff {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    roleId: row.role_id,
    status: row.status,
    joinedAt: row.joined_at
  }
}

export const companyRepo = {
  create(input: {
    slug: string
    name: string
    legalName?: string | null
    gstin?: string | null
    pan?: string | null
    stateCode: string
    address?: string | null
    city?: string | null
    pincode?: string | null
    phone?: string | null
    email?: string | null
    currency?: string
    fyStartMonth?: number
    booksBeginDate: string
    invoiceTerms?: string | null
  }): Company {
    const row = getDrizzle()
      .insert(companies)
      .values({
        slug: input.slug,
        name: input.name,
        legal_name: input.legalName ?? null,
        gstin: input.gstin ?? null,
        pan: input.pan ?? null,
        state_code: input.stateCode,
        address: input.address ?? null,
        city: input.city ?? null,
        pincode: input.pincode ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        currency: input.currency ?? 'INR',
        fy_start_month: input.fyStartMonth ?? 4,
        books_begin_date: input.booksBeginDate,
        invoice_terms: input.invoiceTerms ?? null
      })
      .returning()
      .get()
    return mapCompany(row as CompanyRow)
  },

  findById(id: number): Company | null {
    const row = getDrizzle().select().from(companies).where(eq(companies.id, id)).get() as
      CompanyRow | undefined
    return row ? mapCompany(row) : null
  },

  /**
   * Patch semantics: omitted keys keep their value, explicit null clears the
   * column. Never touches vouchers or any financial history.
   */
  update(
    companyId: number,
    input: {
      name?: string
      legalName?: string | null
      gstin?: string | null
      pan?: string | null
      stateCode?: string
      address?: string | null
      city?: string | null
      pincode?: string | null
      phone?: string | null
      email?: string | null
      invoiceTerms?: string | null
      fyStartMonth?: number
      booksBeginDate?: string
      logo?: string | null
      costingMethod?: string
      roundOffMode?: string
      allowNegativeStock?: boolean
    }
  ): Company | null {
    const set: Partial<typeof companies.$inferInsert> = {}
    if (input.name !== undefined) set.name = input.name
    if (input.legalName !== undefined) set.legal_name = input.legalName
    if (input.gstin !== undefined) set.gstin = input.gstin
    if (input.pan !== undefined) set.pan = input.pan
    if (input.stateCode !== undefined) set.state_code = input.stateCode
    if (input.address !== undefined) set.address = input.address
    if (input.city !== undefined) set.city = input.city
    if (input.pincode !== undefined) set.pincode = input.pincode
    if (input.phone !== undefined) set.phone = input.phone
    if (input.email !== undefined) set.email = input.email
    if (input.invoiceTerms !== undefined) set.invoice_terms = input.invoiceTerms
    if (input.fyStartMonth !== undefined) set.fy_start_month = input.fyStartMonth
    if (input.booksBeginDate !== undefined) set.books_begin_date = input.booksBeginDate
    if (input.logo !== undefined) set.logo = input.logo
    if (input.costingMethod !== undefined) set.costing_method = input.costingMethod
    if (input.roundOffMode !== undefined) set.round_off_mode = input.roundOffMode
    if (input.allowNegativeStock !== undefined) set.allow_negative_stock = input.allowNegativeStock
    if (Object.keys(set).length === 0) return this.findById(companyId)
    const row = getDrizzle()
      .update(companies)
      .set(set)
      .where(eq(companies.id, companyId))
      .returning()
      .get() as CompanyRow | undefined
    return row ? mapCompany(row) : null
  },

  findAll(): Company[] {
    const rows = getDrizzle()
      .select()
      .from(companies)
      .orderBy(companies.id)
      .all() as unknown as CompanyRow[]
    return rows.map(mapCompany)
  },

  count(): number {
    const row = getDrizzle().select({ n: count() }).from(companies).get()
    return row?.n ?? 0
  },

  /**
   * True when a company with this name already has an owner whose email
   * matches. Backs the setup screen's friendly "already exists" check.
   */
  existsWithOwnerCredentials(input: { name: string; email: string }): boolean {
    const db = getDrizzle()
    const email = input.email.trim().toLowerCase()
    const superMember = db
      .select({ id: companyUsers.id })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .where(
        and(
          eq(companyUsers.company_id, companies.id),
          eq(roles.is_super, true),
          eq(sql`lower(${users.email})`, email)
        )
      )

    const row = db
      .select({ x: sql`1` })
      .from(companies)
      .where(and(eq(companies.name, input.name), or(exists(superMember))))
      .get()
    return Boolean(row)
  }
}

export const userRepo = {
  create(input: { fullName: string; email: string; passwordHash: string }): User {
    const row = getDrizzle()
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
  },

  update(
    id: number,
    patch: { fullName?: string; status?: UserStatus; passwordHash?: string }
  ): User | null {
    const set: Partial<typeof users.$inferInsert> = {}
    if (patch.fullName !== undefined) set.full_name = patch.fullName
    if (patch.status !== undefined) set.status = patch.status
    if (patch.passwordHash !== undefined) set.password_hash = patch.passwordHash
    if (Object.keys(set).length === 0) return this.findById(id)
    const row = getDrizzle()
      .update(users)
      .set(set)
      .where(eq(users.id, id))
      .returning()
      .get() as UserRow | undefined
    return row ? mapUser(row) : null
  }
}

export const roleRepo = {
  findById(companyId: number, id: number): Role | null {
    const row = getDrizzle()
      .select()
      .from(roles)
      .where(and(eq(roles.company_id, companyId), eq(roles.id, id)))
      .get() as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  findByName(companyId: number, name: string): Role | null {
    const row = getDrizzle()
      .select()
      .from(roles)
      .where(and(eq(roles.company_id, companyId), eq(roles.name, name)))
      .get() as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  findByNameInsensitive(companyId: number, name: string, excludeId?: number): Role | null {
    const clauses = [
      eq(roles.company_id, companyId),
      eq(sql`lower(${roles.name})`, name.trim().toLowerCase())
    ]
    if (excludeId !== undefined) clauses.push(ne(roles.id, excludeId))
    const row = getDrizzle()
      .select()
      .from(roles)
      .where(and(...clauses))
      .get() as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  listByCompany(companyId: number): Role[] {
    const rows = getDrizzle()
      .select()
      .from(roles)
      .where(eq(roles.company_id, companyId))
      .orderBy(roles.id)
      .all() as unknown as RoleRow[]
    return rows.map(mapRole)
  },

  create(companyId: number, input: { name: string; description: string | null }): Role {
    const row = getDrizzle()
      .insert(roles)
      .values({
        company_id: companyId,
        name: input.name,
        description: input.description,
        is_system_role: false,
        is_super: false
      })
      .returning()
      .get()
    return mapRole(row as RoleRow)
  },

  update(
    companyId: number,
    id: number,
    patch: { name?: string; description?: string | null }
  ): Role | null {
    const set: Partial<typeof roles.$inferInsert> = {}
    if (patch.name !== undefined) set.name = patch.name
    if (patch.description !== undefined) set.description = patch.description
    if (Object.keys(set).length === 0) return this.findById(companyId, id)
    const row = getDrizzle()
      .update(roles)
      .set(set)
      .where(and(eq(roles.company_id, companyId), eq(roles.id, id)))
      .returning()
      .get() as RoleRow | undefined
    return row ? mapRole(row) : null
  },

  delete(companyId: number, id: number): boolean {
    const result = getDrizzle()
      .delete(roles)
      .where(and(eq(roles.company_id, companyId), eq(roles.id, id)))
      .run()
    return result.changes > 0
  },

  /** Replaces a role's grants. The caller validates codes and owns the transaction. */
  setPermissions(roleId: number, codes: string[]): void {
    const db = getDrizzle()
    const unique = [...new Set(codes)]
    db.delete(rolePermissions).where(eq(rolePermissions.role_id, roleId)).run()
    if (unique.length === 0) return
    const rows = db
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.code, unique))
      .all()
    if (rows.length !== unique.length) throw new Error('Unknown permission code')
    db.insert(rolePermissions)
      .values(rows.map((row) => ({ role_id: roleId, permission_id: row.id })))
      .run()
  },

  memberCount(companyId: number, roleId: number): number {
    const row = getDrizzle()
      .select({ n: count() })
      .from(companyUsers)
      .where(and(eq(companyUsers.company_id, companyId), eq(companyUsers.role_id, roleId)))
      .get()
    return row?.n ?? 0
  },

  /** Resolves the permission codes a role grants. Super roles return all codes. */
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
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permission_id))
      .where(eq(rolePermissions.role_id, roleId))
      .all()
    return rows.map((r) => r.code)
  }
}

export const permissionRepo = {
  list(): { id: number; code: string; description: string | null }[] {
    return getDrizzle()
      .select({ id: permissions.id, code: permissions.code, description: permissions.description })
      .from(permissions)
      .orderBy(permissions.code)
      .all()
  },

  findCodes(codes: string[]): string[] {
    const unique = [...new Set(codes)]
    if (unique.length === 0) return []
    const rows = getDrizzle()
      .select({ code: permissions.code })
      .from(permissions)
      .where(inArray(permissions.code, unique))
      .all()
    return rows.map((row) => row.code)
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
  emailExistsInCompany(companyId: number, email: string): boolean {
    const normalized = email.trim().toLowerCase()
    const row = getDrizzle()
      .select({ x: sql`1` })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .where(
        and(eq(companyUsers.company_id, companyId), eq(sql`lower(${users.email})`, normalized))
      )
      .get()
    return Boolean(row)
  },

  create(input: { companyId: number; userId: number; roleId: number }): CompanyStaff {
    const row = getDrizzle()
      .insert(companyUsers)
      .values({
        company_id: input.companyId,
        user_id: input.userId,
        role_id: input.roleId
      })
      .returning()
      .get()
    return mapStaff(row as StaffRow)
  },

  findById(id: number): CompanyStaff | null {
    const row = getDrizzle().select().from(companyUsers).where(eq(companyUsers.id, id)).get() as
      StaffRow | undefined
    return row ? mapStaff(row) : null
  },

  findForCompany(
    companyId: number,
    id: number
  ): { staff: CompanyStaff; user: User; role: Role } | null {
    const row = getDrizzle()
      .select({
        staff: companyUsers,
        user: users,
        role: roles
      })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .where(and(eq(companyUsers.company_id, companyId), eq(companyUsers.id, id)))
      .get()
    if (!row) return null
    return {
      staff: mapStaff(row.staff as StaffRow),
      user: mapUser(row.user as UserRow),
      role: mapRole(row.role as RoleRow)
    }
  },

  listForCompany(companyId: number): {
    id: number
    userId: number
    fullName: string
    email: string
    roleId: number
    roleName: string
    isSuper: boolean
    isSystemRole: boolean
    status: CompanyStaff['status']
    joinedAt: string
  }[] {
    return getDrizzle()
      .select({
        id: companyUsers.id,
        userId: companyUsers.user_id,
        fullName: users.full_name,
        email: users.email,
        roleId: roles.id,
        roleName: roles.name,
        isSuper: roles.is_super,
        isSystemRole: roles.is_system_role,
        status: companyUsers.status,
        joinedAt: companyUsers.joined_at
      })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .where(eq(companyUsers.company_id, companyId))
      .orderBy(users.full_name)
      .all() as {
      id: number
      userId: number
      fullName: string
      email: string
      roleId: number
      roleName: string
      isSuper: boolean
      isSystemRole: boolean
      status: CompanyStaff['status']
      joinedAt: string
    }[]
  },

  update(id: number, patch: { roleId?: number; status?: CompanyStaff['status'] }): CompanyStaff {
    const set: Partial<typeof companyUsers.$inferInsert> = {}
    if (patch.roleId !== undefined) set.role_id = patch.roleId
    if (patch.status !== undefined) set.status = patch.status
    const row = getDrizzle()
      .update(companyUsers)
      .set(set)
      .where(eq(companyUsers.id, id))
      .returning()
      .get()
    return mapStaff(row as StaffRow)
  },

  countActiveSupers(companyId: number, excludeMembershipId?: number): number {
    const clauses = [
      eq(companyUsers.company_id, companyId),
      eq(companyUsers.status, 'ACTIVE'),
      eq(users.status, 'ACTIVE'),
      eq(roles.is_super, true)
    ]
    if (excludeMembershipId !== undefined) {
      clauses.push(ne(companyUsers.id, excludeMembershipId))
    }
    const row = getDrizzle()
      .select({ n: count() })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .where(and(...clauses))
      .get()
    return row?.n ?? 0
  },

  findActiveForLogin(companyId: number, email: string): { user: User; role: Role } | null {
    const normalized = email.trim().toLowerCase()
    const row = getDrizzle()
      .select({
        u_id: users.id,
        u_full_name: users.full_name,
        u_email: users.email,
        u_password_hash: users.password_hash,
        u_status: users.status,
        u_created_at: users.created_at,
        r_id: roles.id,
        r_company_id: roles.company_id,
        r_name: roles.name,
        r_is_system_role: roles.is_system_role,
        r_is_super: roles.is_super,
        r_description: roles.description
      })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .where(
        and(
          eq(companyUsers.company_id, companyId),
          eq(companyUsers.status, 'ACTIVE'),
          eq(users.status, 'ACTIVE'),
          eq(sql`lower(${users.email})`, normalized)
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
        companyId: row.r_company_id,
        name: row.r_name,
        isSystemRole: row.r_is_system_role,
        isSuper: row.r_is_super,
        description: row.r_description
      }
    }
  },

  findActiveMembership(
    companyId: number,
    userId: number
  ): { roleId: number; roleName: string; isSuper: boolean } | null {
    const row = getDrizzle()
      .select({
        roleId: roles.id,
        roleName: roles.name,
        isSuper: roles.is_super
      })
      .from(companyUsers)
      .innerJoin(users, eq(users.id, companyUsers.user_id))
      .innerJoin(roles, eq(roles.id, companyUsers.role_id))
      .innerJoin(companies, eq(companies.id, companyUsers.company_id))
      .where(
        and(
          eq(companyUsers.company_id, companyId),
          eq(companyUsers.user_id, userId),
          eq(companyUsers.status, 'ACTIVE'),
          eq(users.status, 'ACTIVE'),
          eq(companies.status, 'ACTIVE')
        )
      )
      .get()
    if (!row) return null
    return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper }
  }
}
