import { beforeEach, afterEach, afterAll } from 'vitest'
import { openDatabase, closeDatabase } from '../../src/main/db/connection'
import { runMigrations } from '../../src/main/db/migrations'
import {
  seedCatalogPoliciesForOrganization,
  seedPaymentMethodsForOrganization,
  seedPermissions,
  seedPlansForOrganization,
  seedRolesForOrganization,
  seedSalesReferenceData
} from '../../src/main/db/seed'
import {
  organizationRepo,
  roleRepo,
  staffRepo,
  userRepo
} from '../../src/main/repositories/identity'
import { setSession } from '../../src/main/auth/session'
import type { SessionContext } from '../../src/main/domain/identity'

/**
 * Fresh in-memory DB + migrations + all seeds before every test, with a clean
 * session. Helper builds a seeded org + an ACTIVE staff session for the caller.
 */
export function setupSalesDb(): void {
  beforeEach(() => {
    closeDatabase()
    openDatabase(':memory:')
    runMigrations()
    seedPermissions()
    setSession(null)
  })

  afterEach(() => {
    setSession(null)
  })

  afterAll(() => {
    closeDatabase()
  })
}

export interface SeededOrg {
  organizationId: number
  userId: number
}

let orgCounter = 0

/** Creates an org, seeds roles + sales reference data, and logs in the owner. */
export function seedOrgWithSession(roleName = 'Owner'): SeededOrg {
  const n = ++orgCounter
  const org = organizationRepo.create({
    slug: `fit-gym-${n}`,
    name: `Fit Gym ${n}`,
    mobileNumber: `98765432${String(n).padStart(2, '0')}`,
    currency: 'INR',
    timezone: 'Asia/Kolkata'
  })
  seedRolesForOrganization(org.id)
  seedSalesReferenceData(org.id)
  seedPlansForOrganization(org.id)
  seedCatalogPoliciesForOrganization(org.id)
  seedPaymentMethodsForOrganization(org.id)

  const role = roleRepo.findByName(org.id, roleName)!
  const user = userRepo.create({
    fullName: 'Priya Verma',
    email: `priya${n}@fitgym.com`,
    passwordHash: 'hash'
  })
  staffRepo.create({ organizationId: org.id, userId: user.id, roleId: role.id })

  const session: SessionContext = {
    organizationId: org.id,
    organizationSlug: org.slug,
    organizationName: org.name,
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    roleId: role.id,
    roleName: role.name,
    isSuper: role.isSuper,
    permissions: roleRepo.findPermissionCodes(role.id)
  }
  setSession(session)
  return { organizationId: org.id, userId: user.id }
}
