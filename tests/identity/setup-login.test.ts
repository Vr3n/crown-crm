import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import {
  setupOrganization,
  login,
  getAuthStatus,
  createStaffMember
} from '../../src/main/application/identity'
import { getDb, withTransaction } from '../../src/main/db/connection'
import { getSession, setSession } from '../../src/main/auth/session'
import { ValidationError, UnauthorizedError, NotFoundError } from '../../src/main/domain/errors'

setupTestDb()

const VALID = {
  name: 'Example Gym Aurangabad',
  mobileNumber: '+919876543210',
  ownerFullName: 'Neha',
  ownerEmail: 'neha@example.com',
  ownerPassword: 'supersecret123'
}

describe('getAuthStatus', () => {
  it('starts as SETUP_REQUIRED before any organization exists', () => {
    expect(getAuthStatus()).toBe('SETUP_REQUIRED')
  })

  it('becomes LOGIN_REQUIRED after setup but before login', () => {
    setupOrganization(VALID)
    setSession(null)
    expect(getAuthStatus()).toBe('LOGIN_REQUIRED')
  })
})

describe('setupOrganization', () => {
  it('creates an organization and returns an Owner super session', () => {
    const session = setupOrganization(VALID)
    expect(session.organizationName).toBe(VALID.name)
    expect(session.roleName).toBe('Owner')
    expect(session.isSuper).toBe(true)
    expect(session.permissions.length).toBeGreaterThan(0)
    expect(getSession()?.userId).toBe(session.userId)
  })

  it('persists the organization mobile number normalized to 10 digits', () => {
    setupOrganization(VALID)
    const row = getDb().prepare('SELECT mobile_number FROM organizations').get() as {
      mobile_number: string
    }
    expect(row.mobile_number).toBe('9876543210')
  })

  it('creates exactly one organization and one Owner staff membership', () => {
    setupOrganization(VALID)
    const orgCount = (
      getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as {
        n: number
      }
    ).n
    const staffCount = (
      getDb().prepare('SELECT COUNT(*) AS n FROM organization_staff').get() as {
        n: number
      }
    ).n
    const userCount = (
      getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as {
        n: number
      }
    ).n
    expect(orgCount).toBe(1)
    expect(staffCount).toBe(1)
    expect(userCount).toBe(1)
  })

  it('rejects a second organization on the same install', () => {
    setupOrganization(VALID)
    expect(() => setupOrganization({ ...VALID, name: 'Another Gym' })).toThrow(ValidationError)
  })

  it('rejects an empty organization name without creating anything', () => {
    expect(() => setupOrganization({ ...VALID, name: '   ' })).toThrow(ValidationError)
    expect(
      (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
    ).toBe(0)
  })

  it('rejects a password shorter than 8 characters', () => {
    expect(() => setupOrganization({ ...VALID, ownerPassword: 'short' })).toThrow(ValidationError)
    expect(
      (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
    ).toBe(0)
  })

  it('rejects an invalid slug', () => {
    expect(() => setupOrganization({ ...VALID, slug: 'bad slug!' })).toThrow(ValidationError)
    expect(
      (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
    ).toBe(0)
  })

  it('rejects a missing mobile number without creating anything', () => {
    expect(() => setupOrganization({ ...VALID, mobileNumber: '' })).toThrow(ValidationError)
    expect(
      (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
    ).toBe(0)
  })

  it('rejects an invalid mobile number (first digit not 6-9)', () => {
    expect(() => setupOrganization({ ...VALID, mobileNumber: '5123456789' })).toThrow(
      ValidationError
    )
    expect(
      (getDb().prepare('SELECT COUNT(*) AS n FROM organizations').get() as { n: number }).n
    ).toBe(0)
  })

  it('derives a valid slug from the name when not supplied', () => {
    const session = setupOrganization({ ...VALID, slug: undefined })
    expect(session.organizationSlug).toBe('example-gym-aurangabad')
  })
})

describe('login', () => {
  it('authenticates the Owner with correct credentials', () => {
    setupOrganization(VALID)
    const session = login({ email: VALID.ownerEmail, password: VALID.ownerPassword })
    expect(session.userEmail).toBe(VALID.ownerEmail.toLowerCase())
    expect(getSession()?.userId).toBe(session.userId)
  })

  it('is case-insensitive on email', () => {
    setupOrganization(VALID)
    expect(() => login({ email: 'NEHA@EXAMPLE.COM', password: VALID.ownerPassword })).not.toThrow()
  })

  it('rejects a wrong password', () => {
    setupOrganization(VALID)
    expect(() => login({ email: VALID.ownerEmail, password: 'wrong-password' })).toThrow(
      UnauthorizedError
    )
  })

  it('rejects an unknown email', () => {
    setupOrganization(VALID)
    expect(() => login({ email: 'nobody@example.com', password: VALID.ownerPassword })).toThrow(
      UnauthorizedError
    )
  })

  it('rejects login when no organization has been set up', () => {
    expect(() => login({ email: VALID.ownerEmail, password: VALID.ownerPassword })).toThrow(
      NotFoundError
    )
  })
})

describe('createStaffMember — validation and atomicity', () => {
  it('rejects a role that does not exist without leaving a partial user', () => {
    setupOrganization(VALID)
    const before = (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
    expect(() =>
      createStaffMember({
        fullName: 'Kavita',
        email: 'kavita@example.com',
        password: 'supersecret123',
        roleName: 'NoSuchRole'
      })
    ).toThrow(NotFoundError)
    const after = (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
    expect(after).toBe(before)
  })

  it('rolls back the whole transaction when any step fails', () => {
    setupOrganization(VALID)
    const userBefore = (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
    const staffBefore = (
      getDb().prepare('SELECT COUNT(*) AS n FROM organization_staff').get() as {
        n: number
      }
    ).n

    // Simulate a failure mid-transaction by breaking the FK to a fake role.
    expect(() =>
      withTransaction(() => {
        // insert a user whose staff row references a non-existent role -> FK violation
        const result = getDb()
          .prepare('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)')
          .run('X', 'x@y.com', 'hash')
        getDb()
          .prepare(
            'INSERT INTO organization_staff (organization_id, user_id, role_id) VALUES (?, ?, ?)'
          )
          .run(1, Number(result.lastInsertRowid), 999999)
      })
    ).toThrow()

    const userAfter = (getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
    const staffAfter = (
      getDb().prepare('SELECT COUNT(*) AS n FROM organization_staff').get() as {
        n: number
      }
    ).n
    expect(userAfter).toBe(userBefore)
    expect(staffAfter).toBe(staffBefore)
  })
})
