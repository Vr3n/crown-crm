import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import {
  setupOrganization,
  login,
  logout,
  getAuthStatus,
  restoreRememberedLogin
} from '../../src/main/application/identity'
import { getDb } from '../../src/main/db/connection'
import { getSession, setSession } from '../../src/main/auth/session'

setupTestDb()

const VALID = {
  name: 'Example Gym Aurangabad',
  mobileNumber: '+919876543210',
  ownerFullName: 'Neha',
  ownerEmail: 'neha@example.com',
  ownerPassword: 'supersecret123'
}

function rememberedRow(): { key: string; value: string } | null {
  return (
    (getDb().prepare('SELECT * FROM app_meta').get() as
      { key: string; value: string } | undefined) ?? null
  )
}

describe('session persistence — remember', () => {
  it('setup remembers the owner login', () => {
    setupOrganization(VALID)
    expect(rememberedRow()).not.toBeNull()
  })

  it('login remembers the login', () => {
    setupOrganization(VALID)
    setSession(null)
    login({ email: VALID.ownerEmail, password: VALID.ownerPassword })
    expect(rememberedRow()).not.toBeNull()
  })

  it('logout forgets the remembered login', () => {
    setupOrganization(VALID)
    logout()
    expect(rememberedRow()).toBeNull()
    expect(getSession()).toBeNull()
  })
})

describe('session persistence — restore', () => {
  it('restores a session when org, user, and membership are all ACTIVE', () => {
    const initial = setupOrganization(VALID)
    setSession(null)
    const restored = restoreRememberedLogin()
    expect(restored?.userId).toBe(initial.userId)
    expect(restored?.organizationId).toBe(initial.organizationId)
    expect(getSession()?.userId).toBe(initial.userId)
  })

  it('returns null and forgets when the organization is suspended', () => {
    const initial = setupOrganization(VALID)
    getDb()
      .prepare("UPDATE organizations SET status = 'SUSPENDED' WHERE id = ?")
      .run(initial.organizationId)
    setSession(null)
    expect(restoreRememberedLogin()).toBeNull()
    expect(getSession()).toBeNull()
    expect(rememberedRow()).toBeNull()
  })

  it('returns null and forgets when the user is disabled', () => {
    const initial = setupOrganization(VALID)
    getDb().prepare("UPDATE users SET status = 'DISABLED' WHERE id = ?").run(initial.userId)
    setSession(null)
    expect(restoreRememberedLogin()).toBeNull()
    expect(rememberedRow()).toBeNull()
  })

  it('returns null and forgets when the membership row is removed', () => {
    const initial = setupOrganization(VALID)
    getDb().prepare('DELETE FROM organization_staff WHERE user_id = ?').run(initial.userId)
    setSession(null)
    expect(restoreRememberedLogin()).toBeNull()
    expect(rememberedRow()).toBeNull()
  })

  it('returns null and forgets when the remembered user no longer exists', () => {
    const initial = setupOrganization(VALID)
    getDb().prepare('DELETE FROM organization_staff WHERE user_id = ?').run(initial.userId)
    getDb().prepare('DELETE FROM users WHERE id = ?').run(initial.userId)
    setSession(null)
    expect(restoreRememberedLogin()).toBeNull()
    expect(rememberedRow()).toBeNull()
  })

  it('restores nothing before the first setup ever runs', () => {
    expect(restoreRememberedLogin()).toBeNull()
    expect(getAuthStatus()).toBe('SETUP_REQUIRED')
  })

  it('forgets a malformed remembered record', () => {
    setupOrganization(VALID)
    getDb()
      .prepare('UPDATE app_meta SET value = ? WHERE key = ?')
      .run('{not-json', 'remembered_session')
    setSession(null)
    expect(restoreRememberedLogin()).toBeNull()
    expect(rememberedRow()).toBeNull()
  })
})
