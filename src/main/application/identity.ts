import { withTransaction, getDb } from '../db/connection'
import {
  seedCatalogPoliciesForOrganization,
  seedOffersForOrganization,
  seedPlansForOrganization,
  seedRolesForOrganization,
  seedSalesReferenceData
} from '../db/seed'
import { hashPassword, verifyPassword } from '../auth/password'
import { requirePermission, currentOrganizationId, setSession, getSession } from '../auth/session'
import { validateFileType, saveLogoSync } from '../lib/photo-storage'
import { ORG_LOGO_MAX_BYTES } from '../../shared/contracts/organization-logo'
import {
  organizationRepo,
  userRepo,
  roleRepo,
  staffRepo,
  appMetaRepo
} from '../repositories/identity'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  OrganizationExistenceInput,
  SessionContext,
  SetupOrganizationInput,
  UpdateOrganizationInput
} from '../../shared/contracts/identity'
import type { Organization } from '../domain/identity'
import { IndianMobileNumber } from '../domain/phone'
import { ValidationError, UnauthorizedError, NotFoundError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'

const REMEMBERED_SESSION_KEY = 'remembered_session'

/** Describes whether the app needs first-run setup, login, or nothing. */
export function getAuthStatus(): AuthStatus {
  if (organizationRepo.count() === 0) return 'SETUP_REQUIRED'
  return getSession() ? 'AUTHENTICATED' : 'LOGIN_REQUIRED'
}

/**
 * Adds a staff member to the current organization with the given role. Gated by
 * the `user.create` permission, so only super roles (Owner/Admin) can do this —
 * the concrete enforcement point for vertical privilege separation.
 */
export function createStaffMember(input: CreateStaffMemberInput): CreatedStaffMember {
  requirePermission(PERMISSIONS.USER_CREATE)
  const organizationId = currentOrganizationId()

  const fullName = input.fullName.trim()
  const email = input.email.trim().toLowerCase()
  if (!fullName) throw new ValidationError('Full name is required')
  if (!email) throw new ValidationError('Email is required')
  if (input.password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  if (staffRepo.emailExistsInOrganization(organizationId, email)) {
    throw new ValidationError('A user with this email already exists in this organization')
  }

  const role = roleRepo.findByName(organizationId, input.roleName)
  if (!role) throw new NotFoundError(`Role "${input.roleName}" not found`)

  return withTransaction(() => {
    const user = userRepo.create({
      fullName,
      email,
      passwordHash: hashPassword(input.password)
    })
    staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
    return { userId: user.id }
  })
}

/**
 * Updates the current organization's profile and per-document terms. Gated by
 * `org.manage` (the same permission the Organization settings UI checks). Profile
 * rules mirror the setup flow (Indian mobile required; optional email/legal name
 * format-checked); terms are trimmed and stored as NULL when blank so an emptied
 * Terms block simply disappears from the next print.
 *
 * Patch semantics: only keys present in the input are validated and written —
 * an omitted optional field keeps its stored value, while an explicit
 * null/blank clears it.
 */
export function updateOrganization(input: UpdateOrganizationInput): Organization {
  requirePermission(PERMISSIONS.ORG_MANAGE)
  const organizationId = currentOrganizationId()

  const patch: {
    legalName?: string | null
    billingEmail?: string | null
    mobileNumber?: string
    timezone?: string | null
    currency?: string
    invoiceTerms?: string | null
    receiptTerms?: string | null
    refundTerms?: string | null
  } = {}

  if (input.legalName !== undefined) {
    const legalName = input.legalName?.trim() || null
    if (legalName && legalName.length < 2) {
      throw new ValidationError('Legal name must be at least 2 characters')
    }
    patch.legalName = legalName
  }

  if (input.billingEmail !== undefined) {
    const billingEmail = input.billingEmail?.trim().toLowerCase() || null
    if (billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      throw new ValidationError('Enter a valid billing email address')
    }
    patch.billingEmail = billingEmail
  }

  if (input.mobileNumber !== undefined) {
    patch.mobileNumber = IndianMobileNumber.parse(input.mobileNumber).value
  }
  if (input.currency !== undefined) {
    patch.currency = input.currency
  }
  if (input.timezone !== undefined) {
    patch.timezone = input.timezone?.trim() || null
  }

  for (const key of ['invoiceTerms', 'receiptTerms', 'refundTerms'] as const) {
    if (input[key] !== undefined) {
      const terms = input[key]?.trim() || null
      if (terms && terms.length > 2000) {
        throw new ValidationError('Terms must be 2000 characters or fewer')
      }
      patch[key] = terms
    }
  }

  const org = organizationRepo.update(organizationId, patch)
  if (!org) throw new NotFoundError('Organization not found')
  return org
}

/**
 * First-run setup: creates the single Organization, seeds its roles, creates the
 * Owner User and their OrganizationStaff membership — all in one atomic transaction.
 * Rejects if an organization already exists (v1 provisions exactly one per install).
 */
export function setupOrganization(input: SetupOrganizationInput): SessionContext {
  const name = input.name.trim()
  if (!name) throw new ValidationError('Organization name is required')
  if (!input.ownerFullName.trim()) throw new ValidationError('Owner full name is required')
  if (!input.ownerEmail.trim()) throw new ValidationError('Owner email is required')
  if (input.ownerPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters')
  }
  const mobileNumber = IndianMobileNumber.parse(input.mobileNumber)

  const slug = (input.slug ?? slugify(name)).trim().toLowerCase()
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new ValidationError('Slug may only contain lowercase letters, numbers, and hyphens')
  }

  // Optional setup logo: validated before the transaction (shape, type, size);
  // the file itself is written inside the transaction next to the org row.
  let logoBuffer: Buffer | null = null
  let logoFilename: string | null = null
  if (input.logo) {
    try {
      validateFileType(input.logo.filename)
    } catch {
      throw new ValidationError('Logo must be a jpg, png or webp image')
    }
    logoBuffer = Buffer.from(input.logo.data, 'base64')
    if (logoBuffer.length === 0) throw new ValidationError('Logo data is empty')
    if (logoBuffer.length > ORG_LOGO_MAX_BYTES) {
      throw new ValidationError('Logo must be 5MB or smaller')
    }
    logoFilename = input.logo.filename
  }

  return withTransaction(() => {
    if (organizationRepo.count() > 0) {
      throw new ValidationError('An organization has already been set up on this machine')
    }

    const org = organizationRepo.create({
      slug,
      name,
      mobileNumber: mobileNumber.value,
      currency: input.currency ?? 'INR',
      timezone: input.timezone ?? null,
      legalName: null,
      billingEmail: null
    })

    if (logoBuffer && logoFilename) {
      const stored = saveLogoSync(org.id, logoFilename, logoBuffer)
      organizationRepo.updateLogo(org.id, stored)
    }

    seedRolesForOrganization(org.id)
    seedSalesReferenceData(org.id)
    seedPlansForOrganization(org.id)
    seedOffersForOrganization(org.id)
    seedCatalogPoliciesForOrganization(org.id)

    const ownerRole = roleRepo.findByName(org.id, 'Owner')
    if (!ownerRole) throw new NotFoundError('Owner role not found')

    const user = userRepo.create({
      fullName: input.ownerFullName.trim(),
      email: input.ownerEmail.trim().toLowerCase(),
      passwordHash: hashPassword(input.ownerPassword)
    })

    staffRepo.create({ organizationId: org.id, userId: user.id, roleId: ownerRole.id })

    const session = buildSessionContext(org.id, user.id)
    rememberLogin(org.id, user.id)
    return session
  })
}

/**
 * Reports whether an organization already exists under the given name with the
 * given owner credentials (owner email OR organization mobile). Used by the
 * setup screen for a friendly "already exists" validation. A pure read with no
 * session requirement, so it runs pre-login; it mirrors the (org-scoped,
 * app-level) uniqueness style used across this module.
 */
export function checkOrganizationExists(input: OrganizationExistenceInput): boolean {
  const name = input.name.trim()
  const email = input.ownerEmail.trim().toLowerCase()
  let mobile = input.mobileNumber.trim()
  const parsed = IndianMobileNumber.tryParse(mobile)
  if (parsed) mobile = parsed.value

  return organizationRepo.existsWithOwnerCredentials({ name, email, mobile })
}

/**
 * Local login against the current (single) organization. In v1 the slug is not
 * needed — there is only one organization on the machine.
 */
export function login(input: LoginInput): SessionContext {
  const email = input.email.trim().toLowerCase()
  const orgs = organizationRepo.findAll()
  if (orgs.length === 0) {
    throw new NotFoundError('No organization set up. Run setup first.')
  }
  const org = orgs[0]

  const membership = staffRepo.findActiveForLogin(org.id, email)
  if (!membership || !verifyPassword(input.password, membership.user.passwordHash)) {
    throw new UnauthorizedError('Invalid email or password')
  }

  const session = buildSessionContext(org.id, membership.user.id)
  rememberLogin(org.id, membership.user.id)
  return session
}

/**
 * Persists the active login so it can be restored across app restarts. Stores
 * only the identity keys ({ organizationId, userId }) — the SessionContext is
 * re-derived from live DB data on restore, never snapshotted.
 */
function rememberLogin(organizationId: number, userId: number): void {
  appMetaRepo.set(REMEMBERED_SESSION_KEY, JSON.stringify({ organizationId, userId }))
}

/**
 * Clears the remembered login. Fire-and-forget safe: a persistence failure here
 * must never break the current flow, so the worst outcome is a stale row that
 * simply fails validation again next launch.
 */
function forgetLogin(): void {
  try {
    appMetaRepo.delete(REMEMBERED_SESSION_KEY)
  } catch {
    // Swallow: a stale remembered_login row degrades to a login screen next launch.
  }
}

/**
 * Rehydrates the in-memory session from a previously remembered login. Called at
 * startup before the window is created, so the renderer's first `identity.status`
 * already sees AUTHENTICATED (no login-screen flash). The single joined
 * membership query re-validates that the organization, user, and membership are
 * all still ACTIVE; any staleness forgets the login and falls back to login.
 */
export function restoreRememberedLogin(): SessionContext | null {
  const raw = appMetaRepo.get(REMEMBERED_SESSION_KEY)
  if (!raw) return null

  let remembered: { organizationId: number; userId: number }
  try {
    remembered = JSON.parse(raw) as { organizationId: number; userId: number }
  } catch {
    forgetLogin()
    return null
  }

  const membership = staffRepo.findActiveMembership(remembered.organizationId, remembered.userId)
  if (!membership) {
    forgetLogin()
    return null
  }

  return buildSessionContext(remembered.organizationId, remembered.userId)
}

/** Ends the current session and clears any remembered login. */
export function logout(): void {
  setSession(null)
  forgetLogin()
}

/** Builds (and stores) the SessionContext for a user within an organization. */
function buildSessionContext(organizationId: number, userId: number): SessionContext {
  const org = organizationRepo.findById(organizationId)
  const user = userRepo.findById(userId)
  if (!org || !user) throw new NotFoundError('Organization or user not found')

  const row = getStaffRow(organizationId, userId)
  if (!row) throw new NotFoundError('No staff membership found')

  const permissions = roleRepo.findPermissionCodes(row.roleId)

  const session: SessionContext = {
    organizationId: org.id,
    organizationSlug: org.slug,
    organizationName: org.name,
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

function getStaffRow(organizationId: number, userId: number): StaffRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT r.id AS roleId, r.name AS roleName, r.is_super AS isSuper
       FROM organization_staff os
       JOIN roles r ON r.id = os.role_id
       WHERE os.organization_id = ? AND os.user_id = ?`
    )
    .get(organizationId, userId) as
    { roleId: number; roleName: string; isSuper: number } | undefined
  if (!row) return null
  return { roleId: row.roleId, roleName: row.roleName, isSuper: row.isSuper === 1 }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
