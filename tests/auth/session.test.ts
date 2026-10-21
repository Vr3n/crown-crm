import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getSession,
  setSession,
  requireSession,
  requirePermission,
  currentOrganizationId
} from '../../src/main/auth/session'
import { PERMISSIONS } from '../../src/main/db/permissions'
import { ForbiddenError, UnauthenticatedError } from '../../src/main/domain/errors'
import type { SessionContext } from '../../src/main/domain/identity'

function makeSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    organizationId: 1,
    organizationSlug: 'example-gym',
    organizationName: 'Example Gym',
    userId: 1,
    userFullName: 'Neha',
    userEmail: 'neha@example.com',
    roleId: 1,
    roleName: 'Manager',
    isSuper: false,
    permissions: [],
    ...overrides
  }
}

beforeEach(() => setSession(null))
afterEach(() => setSession(null))

describe('session store', () => {
  it('is null before any login', () => {
    expect(getSession()).toBeNull()
  })

  it('stores and returns the current session', () => {
    setSession(makeSession({ userId: 42 }))
    expect(getSession()?.userId).toBe(42)
  })
})

describe('requireSession', () => {
  it('throws when there is no authenticated session', () => {
    expect(() => requireSession()).toThrow()
  })

  it('returns the session when authenticated', () => {
    setSession(makeSession({ userId: 42 }))
    expect(requireSession().userId).toBe(42)
  })
})

describe('requirePermission', () => {
  it('throws when there is no session at all (unauthenticated)', () => {
    expect(() => requirePermission(PERMISSIONS.USER_CREATE)).toThrow(UnauthenticatedError)
  })

  it('does not throw for a granted permission', () => {
    setSession(makeSession({ isSuper: false, permissions: [PERMISSIONS.USER_VIEW] }))
    expect(() => requirePermission(PERMISSIONS.USER_VIEW)).not.toThrow()
  })

  it('throws ForbiddenError for an ungranted permission (least privilege)', () => {
    setSession(makeSession({ isSuper: false, permissions: [PERMISSIONS.USER_VIEW] }))
    expect(() => requirePermission(PERMISSIONS.USER_CREATE)).toThrow(ForbiddenError)
  })

  it('grants every permission to a super role without enumeration', () => {
    setSession(makeSession({ isSuper: true, permissions: [] }))
    expect(() => requirePermission(PERMISSIONS.ORG_MANAGE)).not.toThrow()
    expect(() => requirePermission(PERMISSIONS.USER_CREATE)).not.toThrow()
    expect(() => requirePermission(PERMISSIONS.ROLE_MANAGE)).not.toThrow()
  })

  it('never grants a permission absent from the session for a non-super role', () => {
    setSession(makeSession({ isSuper: false, permissions: [PERMISSIONS.USER_VIEW] }))
    for (const code of Object.values(PERMISSIONS)) {
      if (code === PERMISSIONS.USER_VIEW) continue
      expect(() =>
        requirePermission(code as (typeof PERMISSIONS)[keyof typeof PERMISSIONS])
      ).toThrow(ForbiddenError)
    }
  })
})

describe('currentOrganizationId', () => {
  it('returns the active organization from the session', () => {
    setSession(makeSession({ organizationId: 7 }))
    expect(currentOrganizationId()).toBe(7)
  })

  it('throws when unauthenticated', () => {
    expect(() => currentOrganizationId()).toThrow()
  })
})
