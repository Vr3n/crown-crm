import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import { setupOrganization, login, createStaffMember } from '../../src/main/application/identity'
import { getDb } from '../../src/main/db/connection'
import { requirePermission, setSession } from '../../src/main/auth/session'
import { PERMISSIONS } from '../../src/main/db/permissions'
import { SEED_ROLES } from '../../src/main/db/seed'
import { ForbiddenError, ValidationError } from '../../src/main/domain/errors'
import type { SessionContext } from '../../src/main/domain/identity'

setupTestDb()

const OWNER = { fullName: 'Neha', email: 'neha@example.com', password: 'supersecret123' }
const PASSWORD = 'supersecret123'

function setupWithStaff(): SessionContext {
  const ownerSession = setupOrganization({
    name: 'Example Gym',
    mobileNumber: '+919876543210',
    ownerFullName: OWNER.fullName,
    ownerEmail: OWNER.email,
    ownerPassword: OWNER.password
  })
  for (const [name, email, roleName] of [
    ['Manoj', 'manoj@example.com', 'Manager'],
    ['Sana', 'sana@example.com', 'Sales'],
    ['Arjun', 'arjun@example.com', 'Front Desk'],
    ['Kavita', 'kavita@example.com', 'Finance']
  ] as const) {
    createStaffMember({ fullName: name, email, password: PASSWORD, roleName })
  }
  return ownerSession
}

function loginAs(email: string): SessionContext {
  return login({ email, password: PASSWORD })
}

// Expected permission sets per seeded role — derived from the seed data so the
// matrix never drifts from `SEED_ROLES` (see db/seed.ts).
const EXPECTED_PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  SEED_ROLES.filter((r) => !r.is_super).map((r) => [r.name, r.permissions])
)

describe('RBAC authorization matrix', () => {
  it('assigns each role exactly its configured permissions', () => {
    setupWithStaff()
    const roleEmails: Record<string, string> = {
      Manager: 'manoj@example.com',
      Sales: 'sana@example.com',
      'Front Desk': 'arjun@example.com',
      Finance: 'kavita@example.com'
    }
    for (const [roleName, expected] of Object.entries(EXPECTED_PERMISSIONS)) {
      const session = loginAs(roleEmails[roleName])
      expect(session.roleName, `role ${roleName}`).toBe(roleName)
      expect(session.isSuper, `role ${roleName}`).toBe(false)
      expect([...session.permissions].sort(), `permissions of ${roleName}`).toEqual(
        [...expected].sort()
      )
    }
  })

  it('grants Owner (super) the whole catalog without enumeration', () => {
    setupWithStaff()
    const owner = loginAs(OWNER.email)
    expect(owner.isSuper).toBe(true)
    expect(owner.permissions.length).toBeGreaterThanOrEqual(
      (getDb().prepare('SELECT COUNT(*) AS n FROM permissions').get() as { n: number }).n
    )
  })
})

describe('vertical privilege escalation — lower roles cannot perform admin actions', () => {
  it('lets the Owner (super) create staff', () => {
    setupWithStaff()
    loginAs(OWNER.email)
    expect(() =>
      createStaffMember({
        fullName: 'New Hire',
        email: 'newhire@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).not.toThrow()
  })

  it('blocks a Manager from creating staff (missing user.create)', () => {
    setupWithStaff()
    loginAs('manoj@example.com')
    expect(() =>
      createStaffMember({
        fullName: 'Intruder',
        email: 'intruder@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).toThrow(ForbiddenError)
  })

  it('blocks a Sales user from creating staff', () => {
    setupWithStaff()
    loginAs('sana@example.com')
    expect(() =>
      createStaffMember({
        fullName: 'X',
        email: 'x@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).toThrow(ForbiddenError)
  })

  it('blocks a Front Desk user from creating staff', () => {
    setupWithStaff()
    loginAs('arjun@example.com')
    expect(() =>
      createStaffMember({
        fullName: 'X',
        email: 'x@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).toThrow(ForbiddenError)
  })

  it('blocks an unauthenticated caller entirely', () => {
    setupWithStaff()
    setSession(null) // simulate a caller with no active session
    expect(() =>
      createStaffMember({
        fullName: 'X',
        email: 'x@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).toThrow()
  })
})

describe('permission guard at the command layer (not just UI)', () => {
  it('Manager can read users but cannot create or manage them', () => {
    setupWithStaff()
    loginAs('manoj@example.com')
    expect(() => requirePermission(PERMISSIONS.USER_VIEW)).not.toThrow()
    expect(() => requirePermission(PERMISSIONS.USER_CREATE)).toThrow(ForbiddenError)
    expect(() => requirePermission(PERMISSIONS.USER_MANAGE)).toThrow(ForbiddenError)
    expect(() => requirePermission(PERMISSIONS.ROLE_MANAGE)).toThrow(ForbiddenError)
  })

  it('Super role bypasses the guard for every permission', () => {
    setupWithStaff()
    loginAs(OWNER.email)
    for (const code of Object.values(PERMISSIONS)) {
      expect(() =>
        requirePermission(code as (typeof PERMISSIONS)[keyof typeof PERMISSIONS])
      ).not.toThrow()
    }
  })
})

describe('email uniqueness within an organization', () => {
  it('rejects a second staff member with the same email', () => {
    setupWithStaff()
    loginAs(OWNER.email)
    expect(() =>
      createStaffMember({
        fullName: 'Another Arjun',
        email: 'arjun@example.com',
        password: PASSWORD,
        roleName: 'Sales'
      })
    ).toThrow(ValidationError)
  })
})
