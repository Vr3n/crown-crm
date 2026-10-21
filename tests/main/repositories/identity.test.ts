import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { getDb } from '../../../src/main/db/connection'
import { seedRolesForOrganization, SEED_ROLES } from '../../../src/main/db/seed'
import { ALL_PERMISSION_CODES } from '../../../src/main/db/permissions'
import {
  organizationRepo,
  userRepo,
  roleRepo,
  appMetaRepo,
  staffRepo
} from '../../../src/main/repositories/identity'
import type { Organization, Role } from '../../../src/main/domain/identity'

/**
 * Regression tests for the Drizzle retrofit of the identity repositories:
 * the query-builder statements must reproduce the shipped behavior (field
 * mapping, join semantics, case-insensitive lookups, ACTIVE-only filters).
 */
setupTestDb()

function createOrg(): Organization {
  return organizationRepo.create({
    slug: 'fit-gym',
    name: 'Fit Gym',
    mobileNumber: '9876543210',
    currency: 'INR'
  })
}

function seedOrgWithRoles(roleName = 'Owner'): { org: Organization; role: Role } {
  const org = createOrg()
  seedRolesForOrganization(org.id)
  const role = roleRepo.findByName(org.id, roleName)
  if (!role) throw new Error(`role ${roleName} not seeded`)
  return { org, role }
}

describe('organizationRepo', () => {
  it('creates and reads an organization with mapped camelCase fields', () => {
    const org = createOrg()
    expect(org.id).toBeGreaterThan(0)
    expect(org).toMatchObject({
      slug: 'fit-gym',
      name: 'Fit Gym',
      mobileNumber: '9876543210',
      currency: 'INR',
      status: 'ACTIVE',
      legalName: null,
      planTier: null
    })
    expect(organizationRepo.findById(org.id)).toEqual(org)
    expect(organizationRepo.findById(99999)).toBeNull()
    expect(organizationRepo.findAll()).toHaveLength(1)
    expect(organizationRepo.count()).toBe(1)
  })

  it('detects an org by super-member email (case-insensitive) or stored mobile', () => {
    const org = createOrg()
    seedRolesForOrganization(org.id)
    const owner = roleRepo.findByName(org.id, 'Owner')!
    const user = userRepo.create({
      fullName: 'Ravi',
      email: 'Ravi@Example.com',
      passwordHash: 'hash'
    })
    staffRepo.create({ organizationId: org.id, userId: user.id, roleId: owner.id })

    expect(
      organizationRepo.existsWithOwnerCredentials({
        name: 'Fit Gym',
        email: 'ravi@example.com',
        mobile: '0000000000'
      })
    ).toBe(true)
    expect(
      organizationRepo.existsWithOwnerCredentials({
        name: 'Fit Gym',
        email: 'other@example.com',
        mobile: '9876543210'
      })
    ).toBe(true)
    expect(
      organizationRepo.existsWithOwnerCredentials({
        name: 'Fit Gym',
        email: 'other@example.com',
        mobile: '0000000000'
      })
    ).toBe(false)
    expect(
      organizationRepo.existsWithOwnerCredentials({
        name: 'Other Gym',
        email: 'ravi@example.com',
        mobile: '9876543210'
      })
    ).toBe(false)
  })

  it('updates the profile and per-document terms, clearing nulls', () => {
    const org = createOrg()

    const updated = organizationRepo.update(org.id, {
      legalName: 'Fit Gym LLP',
      billingEmail: 'billing@fitgym.com',
      mobileNumber: '9123456789',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      invoiceTerms: 'Invoice clause one',
      receiptTerms: 'Receipt clause one',
      refundTerms: 'Refund clause one'
    })

    expect(updated).toMatchObject({
      id: org.id,
      legalName: 'Fit Gym LLP',
      billingEmail: 'billing@fitgym.com',
      mobileNumber: '9123456789',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      invoiceTerms: 'Invoice clause one',
      receiptTerms: 'Receipt clause one',
      refundTerms: 'Refund clause one'
    })
    expect(organizationRepo.findById(org.id)!.invoiceTerms).toBe('Invoice clause one')

    const cleared = organizationRepo.update(org.id, {
      legalName: null,
      billingEmail: null,
      mobileNumber: '9111111111',
      timezone: null,
      currency: 'INR',
      invoiceTerms: null,
      receiptTerms: null,
      refundTerms: null
    })
    expect(cleared!.invoiceTerms).toBeNull()
    expect(cleared!.receiptTerms).toBeNull()
    expect(cleared!.refundTerms).toBeNull()
    expect(cleared!.legalName).toBeNull()
  })

  it('returns null when updating an organization that does not exist', () => {
    expect(
      organizationRepo.update(99999, {
        mobileNumber: '9876543210',
        currency: 'INR'
      })
    ).toBeNull()
  })

  it('creates an organization with term defaults pre-seeded by the column default', () => {
    const org = createOrg()
    const row = getDb()
      .prepare('SELECT invoice_terms, receipt_terms, refund_terms FROM organizations WHERE id = ?')
      .get(org.id) as {
      invoice_terms: string | null
      receipt_terms: string | null
      refund_terms: string | null
    }
    expect(row.invoice_terms).toBeTruthy()
    expect(row.receipt_terms).toBeTruthy()
    expect(row.refund_terms).toBeTruthy()
    expect(org.invoiceTerms).toBe(row.invoice_terms)
    expect(org.receiptTerms).toBe(row.receipt_terms)
    expect(org.refundTerms).toBe(row.refund_terms)
  })
})

describe('userRepo', () => {
  it('creates and reads a user', () => {
    const user = userRepo.create({ fullName: 'A', email: 'a@x.com', passwordHash: 'h' })
    expect(user).toMatchObject({ fullName: 'A', email: 'a@x.com', status: 'ACTIVE' })
    expect(userRepo.findById(user.id)).toEqual(user)
    expect(userRepo.findById(99999)).toBeNull()
  })
})

describe('roleRepo', () => {
  it('finds a role by name within an organization', () => {
    const { org, role } = seedOrgWithRoles('Manager')
    expect(role).toMatchObject({ organizationId: org.id, name: 'Manager', isSuper: false })
    expect(roleRepo.findByName(org.id, 'Nope')).toBeNull()
  })

  it('returns every catalog permission for a super role', () => {
    const { role } = seedOrgWithRoles('Owner')
    expect(roleRepo.findPermissionCodes(role.id).sort()).toEqual([...ALL_PERMISSION_CODES].sort())
  })

  it('returns exactly the configured grants for a non-super role', () => {
    const { role } = seedOrgWithRoles('Manager')
    const expected = SEED_ROLES.find((r) => r.name === 'Manager')!.permissions
    expect(roleRepo.findPermissionCodes(role.id).sort()).toEqual([...expected].sort())
  })

  it('returns an empty list for an unknown role', () => {
    expect(roleRepo.findPermissionCodes(99999)).toEqual([])
  })
})

describe('appMetaRepo', () => {
  it('round-trips, upserts, and deletes a value', () => {
    expect(appMetaRepo.get('remembered_login')).toBeNull()
    appMetaRepo.set('remembered_login', 'abc')
    expect(appMetaRepo.get('remembered_login')).toBe('abc')
    appMetaRepo.set('remembered_login', 'xyz')
    expect(appMetaRepo.get('remembered_login')).toBe('xyz')
    appMetaRepo.delete('remembered_login')
    expect(appMetaRepo.get('remembered_login')).toBeNull()
  })
})

describe('staffRepo', () => {
  it('creates staff and enforces email uniqueness within the organization', () => {
    const org = createOrg()
    seedRolesForOrganization(org.id)
    const manager = roleRepo.findByName(org.id, 'Manager')!
    const user = userRepo.create({ fullName: 'A', email: 'a@x.com', passwordHash: 'h' })

    const staff = staffRepo.create({ organizationId: org.id, userId: user.id, roleId: manager.id })
    expect(staff).toMatchObject({
      organizationId: org.id,
      userId: user.id,
      roleId: manager.id,
      status: 'ACTIVE'
    })
    expect(staffRepo.findById(staff.id)).toEqual(staff)
    expect(staffRepo.emailExistsInOrganization(org.id, 'a@x.com')).toBe(true)
    expect(staffRepo.emailExistsInOrganization(org.id, 'b@x.com')).toBe(false)
  })

  it('finds the active login membership with user + role', () => {
    const { org, role } = seedOrgWithRoles('Owner')
    const user = userRepo.create({ fullName: 'B', email: 'b@x.com', passwordHash: 'h' })
    staffRepo.create({ organizationId: org.id, userId: user.id, roleId: role.id })

    const found = staffRepo.findActiveForLogin(org.id, 'b@x.com')
    expect(found).not.toBeNull()
    expect(found!.user).toMatchObject({ email: 'b@x.com', fullName: 'B', status: 'ACTIVE' })
    expect(found!.role).toMatchObject({ name: 'Owner', isSuper: true })

    expect(staffRepo.findActiveForLogin(org.id, 'nope@x.com')).toBeNull()
    expect(staffRepo.findActiveForLogin(99999, 'b@x.com')).toBeNull()
  })

  it('returns active memberships and hides them once a row is inactive', () => {
    const { org, role } = seedOrgWithRoles('Manager')
    const user = userRepo.create({ fullName: 'C', email: 'c@x.com', passwordHash: 'h' })
    staffRepo.create({ organizationId: org.id, userId: user.id, roleId: role.id })

    expect(staffRepo.findActiveMembership(org.id, user.id)).toEqual({
      roleId: role.id,
      roleName: 'Manager',
      isSuper: false
    })
    expect(staffRepo.findActiveMembership(org.id, 99999)).toBeNull()

    getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run('INACTIVE', user.id)
    expect(staffRepo.findActiveMembership(org.id, user.id)).toBeNull()
  })
})
