import { withTransaction, getDb } from '../db/connection'
import { seedCompanyDefaults, seedRolesForCompany } from '../db/seed'
import { hashPassword, verifyPassword } from '../auth/password'
import { requirePermission, currentCompanyId, setSession, getSession } from '../auth/session'
import { companyRepo, userRepo, roleRepo, staffRepo, appMetaRepo } from '../repositories/identity'
import { numberingRepo } from '../repositories/numbering'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  CompanyExistenceInput,
  SessionContext,
  SetupCompanyInput,
  UpdateCompanyInput
} from '../../shared/contracts/identity'
import type { Company } from '../domain/identity'
import { ValidationError, UnauthorizedError, NotFoundError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'

const REMEMBERED_SESSION_KEY = 'remembered_session'
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/
const STATE_RE = /^\d{2}$/

/** Describes whether the app needs first-run setup, login, or nothing. */
export function getAuthStatus(): AuthStatus {
  if (companyRepo.count() === 0) return 'SETUP_REQUIRED'
  return getSession() ? 'AUTHENTICATED' : 'LOGIN_REQUIRED'
}

/**
 * Adds a staff member to the current company with the given role. Gated by
 * `user.create`, so only super roles can do this.
 */
export function createStaffMember(input: CreateStaffMemberInput): CreatedStaffMember {
  requirePermission(PERMISSIONS.USER_CREATE)
  const companyId = currentCompanyId()

  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  if (!fullName) throw new ValidationError('Full name is required')
  if (!email) throw new ValidationError('Email is required')
  if (input.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  if (staffRepo.emailExistsInCompany(companyId, email)) {
    throw new ValidationError('A user with this email already exists in this company')
  }

  const role = roleRepo.findByName(companyId, input.roleName)
  if (!role) throw new NotFoundError(`Role "${input.roleName}" not found`)

  return withTransaction(() => {
    const user = userRepo.create({
      fullName,
      email,
      passwordHash: hashPassword(input.password)
    })
    staffRepo.create({ companyId, userId: user.id, roleId: role.id })
    return { userId: user.id }
  })
}

/**
 * Updates the current company profile. Patch semantics: omitted keys keep their
 * stored value, an explicit null clears the column. Never touches vouchers.
 */
export function updateCompany(input: UpdateCompanyInput): Company {
  requirePermission(PERMISSIONS.COMPANY_MANAGE)
  const companyId = currentCompanyId()

  const patch: Parameters<typeof companyRepo.update>[1] = {}

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (name.length < 2) throw new ValidationError('Company name must be at least 2 characters')
    patch.name = name
  }
  if (input.legalName !== undefined) {
    const legalName = input.legalName?.trim() || null
    if (legalName && legalName.length < 2) {
      throw new ValidationError('Legal name must be at least 2 characters')
    }
    patch.legalName = legalName
  }
  if (input.gstin !== undefined) {
    const gstin = input.gstin?.trim().toUpperCase() || null
    if (gstin && !GSTIN_RE.test(gstin))
      throw new ValidationError('Enter a valid 15 character GSTIN')
    patch.gstin = gstin
  }
  if (input.pan !== undefined) {
    const pan = input.pan?.trim().toUpperCase() || null
    if (pan && !PAN_RE.test(pan)) throw new ValidationError('Enter a valid 10 character PAN')
    patch.pan = pan
  }
  if (input.stateCode !== undefined) {
    if (!STATE_RE.test(input.stateCode)) throw new ValidationError('State code must be two digits')
    patch.stateCode = input.stateCode
  }
  if (input.address !== undefined) patch.address = input.address?.trim() || null
  if (input.city !== undefined) patch.city = input.city?.trim() || null
  if (input.pincode !== undefined) {
    const pincode = input.pincode?.trim() || null
    if (pincode && !/^\d{6}$/.test(pincode)) throw new ValidationError('Pincode must be six digits')
    patch.pincode = pincode
  }
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null
  if (input.email !== undefined) {
    const email = input.email?.trim().toLowerCase() || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError('Enter a valid email address')
    }
    patch.email = email
  }
  if (input.invoiceTerms !== undefined) {
    const terms = input.invoiceTerms?.trim() || null
    if (terms && terms.length > 2000) {
      throw new ValidationError('Terms must be 2000 characters or fewer')
    }
    patch.invoiceTerms = terms
  }
  if (input.fyStartMonth !== undefined) patch.fyStartMonth = input.fyStartMonth
  if (input.booksBeginDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.booksBeginDate)) {
      throw new ValidationError('Books begin date must be YYYY-MM-DD')
    }
    patch.booksBeginDate = input.booksBeginDate
  }
  if (input.costingMethod !== undefined) patch.costingMethod = input.costingMethod
  if (input.roundOffMode !== undefined) patch.roundOffMode = input.roundOffMode
  if (input.allowNegativeStock !== undefined) patch.allowNegativeStock = input.allowNegativeStock

  const updated = companyRepo.update(companyId, patch)
  if (!updated) throw new NotFoundError('Company not found')
  return updated
}

/**
 * First-run setup: creates the single company, seeds its chart of accounts and
 * roles, creates the Owner user and staff membership, all in one transaction.
 */
export function setupCompany(input: SetupCompanyInput): SessionContext {
  const name = input.name.trim()
  if (!name) throw new ValidationError('Company name is required')
  if (!input.ownerFullName.trim()) throw new ValidationError('Owner full name is required')
  if (!input.ownerEmail.trim()) throw new ValidationError('Owner email is required')
  if (input.ownerPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  if (!STATE_RE.test(input.stateCode)) throw new ValidationError('State code must be two digits')

  const gstin = input.gstin?.trim().toUpperCase() || null
  if (gstin && !GSTIN_RE.test(gstin)) throw new ValidationError('Enter a valid 15 character GSTIN')

  const booksBeginDate = input.booksBeginDate ?? todayIso()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booksBeginDate)) {
    throw new ValidationError('Books begin date must be YYYY-MM-DD')
  }

  const slug = (input.slug ?? slugify(name)).trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new ValidationError('Slug may only contain lowercase letters, numbers, and hyphens')
  }

  return withTransaction(() => {
    if (companyRepo.count() > 0) {
      throw new ValidationError('A company has already been set up on this machine')
    }

    const created = companyRepo.create({
      slug,
      name,
      gstin,
      stateCode: input.stateCode,
      phone: input.phone?.trim() || null,
      email: input.ownerEmail.trim().toLowerCase(),
      currency: input.currency ?? 'INR',
      booksBeginDate
    })

    seedRolesForCompany(created.id)
    seedCompanyDefaults(created.id, booksBeginDate)
    numberingRepo.ensureDefaults(created.id)

    const ownerRole = roleRepo.findByName(created.id, 'Owner')
    if (!ownerRole) throw new NotFoundError('Owner role not found')

    const user = userRepo.create({
      fullName: input.ownerFullName.trim(),
      email: input.ownerEmail.trim().toLowerCase(),
      passwordHash: hashPassword(input.ownerPassword)
    })

    staffRepo.create({ companyId: created.id, userId: user.id, roleId: ownerRole.id })

    const session = buildSessionContext(created.id, user.id)
    rememberLogin(created.id, user.id)
    return session
  })
}

/** Friendly "already exists" check used by the setup screen before submit. */
export function checkCompanyExists(input: CompanyExistenceInput): boolean {
  return companyRepo.existsWithOwnerCredentials({
    name: input.name.trim(),
    email: input.ownerEmail.trim().toLowerCase()
  })
}

/** Local login against the single company on this machine. */
export function login(input: LoginInput): SessionContext {
  const email = input.email.trim().toLowerCase()
  const all = companyRepo.findAll()
  if (all.length === 0) throw new NotFoundError('No company set up. Run setup first.')
  const company = all[0]

  const staffMembership = staffRepo.findActiveForLogin(company.id, email)
  if (!staffMembership || !verifyPassword(input.password, staffMembership.user.passwordHash)) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const session = buildSessionContext(company.id, staffMembership.user.id)
  rememberLogin(company.id, staffMembership.user.id)
  return session
}

function rememberLogin(companyId: number, userId: number): void {
  appMetaRepo.set(REMEMBERED_SESSION_KEY, JSON.stringify({ companyId, userId }))
}

function forgetLogin(): void {
  try {
    appMetaRepo.delete(REMEMBERED_SESSION_KEY)
  } catch {
    // A stale remembered session degrades to a login screen on the next launch.
  }
}

export function restoreRememberedLogin(): SessionContext | null {
  const raw = appMetaRepo.get(REMEMBERED_SESSION_KEY)
  if (!raw) return null

  let remembered: { companyId: number; userId: number }
  try {
    remembered = JSON.parse(raw) as { companyId: number; userId: number }
  } catch {
    forgetLogin()
    return null
  }

  const staffMembership = staffRepo.findActiveMembership(remembered.companyId, remembered.userId)
  if (!staffMembership) {
    forgetLogin()
    return null
  }

  return buildSessionContext(remembered.companyId, remembered.userId)
}

export function logout(): void {
  setSession(null)
  forgetLogin()
}

function buildSessionContext(companyId: number, userId: number): SessionContext {
  const company = companyRepo.findById(companyId)
  const user = userRepo.findById(userId)
  if (!company || !user) throw new NotFoundError('Company or user not found')

  const row = getStaffRow(companyId, userId)
  if (!row) throw new NotFoundError('No staff membership found')

  const permissions = roleRepo.findPermissionCodes(row.roleId)

  const session: SessionContext = {
    companyId: company.id,
    companySlug: company.slug,
    companyName: company.name,
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    roleId: row.roleId,
    roleName: row.roleName,
    isSuper: row.isSuper,
    permissions
  }
  setSession(session)
  return session
}

interface StaffRow {
  roleId: number
  roleName: string
  isSuper: boolean
}

function getStaffRow(companyId: number, userId: number): StaffRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT r.id AS roleId, r.name AS roleName, r.is_super AS isSuper
       FROM company_users cu
       JOIN roles r ON r.id = cu.role_id
       WHERE cu.company_id = ? AND cu.user_id = ?`
    )
    .get(companyId, userId) as { roleId: number; roleName: string; isSuper: number } | undefined
  if (!row) return null
  return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper === 1 }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
