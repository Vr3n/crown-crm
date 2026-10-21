import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import {
  checkCompanyExists,
  createStaffMember,
  getAuthStatus,
  login,
  logout,
  setupCompany,
  updateCompany
} from '../../src/main/application/identity'
import { companyRepo } from '../../src/main/repositories/identity'
import { getDrizzle } from '../../src/main/db/connection'
import { accounts, companyUsers, roles } from '../../src/main/db/schema'
import { eq } from 'drizzle-orm'

setupTestDb()

const INPUT = {
  name: 'Acme Distributors',
  ownerFullName: 'Viren Patel',
  ownerEmail: 'owner@acme.in',
  ownerPassword: 'correct-horse',
  stateCode: '27',
  gstin: '27AABFU4477G1ZY',
  phone: '9876543210',
  booksBeginDate: '2026-04-01'
}

describe('first-run setup', () => {
  it('creates the company, roles, chart of accounts and owner in one go', () => {
    const session = setupCompany(INPUT)

    expect(session.companyName).toBe('Acme Distributors')
    expect(session.userEmail).toBe('owner@acme.in')
    expect(session.isSuper).toBe(true)
    expect(session.permissions.length).toBeGreaterThan(10)
    expect(companyRepo.count()).toBe(1)

    const db = getDrizzle()
    const company = companyRepo.findAll()[0]
    expect(company.stateCode).toBe('27')
    expect(company.gstin).toBe('27AABFU4477G1ZY')
    expect(company.booksBeginDate).toBe('2026-04-01')

    expect(db.select().from(roles).where(eq(roles.company_id, company.id)).all()).toHaveLength(5)
    expect(
      db.select().from(companyUsers).where(eq(companyUsers.company_id, company.id)).all()
    ).toHaveLength(1)
    expect(
      db.select().from(accounts).where(eq(accounts.company_id, company.id)).all().length
    ).toBeGreaterThan(15)
  })

  it('reports SETUP_REQUIRED before setup and AUTHENTICATED after', () => {
    expect(getAuthStatus()).toBe('SETUP_REQUIRED')
    setupCompany(INPUT)
    expect(getAuthStatus()).toBe('AUTHENTICATED')
  })

  it('refuses a second company', () => {
    setupCompany(INPUT)
    expect(() => setupCompany({ ...INPUT, name: 'Second Books' })).toThrow()
  })

  it('rejects a bad state code and GSTIN', () => {
    expect(() => setupCompany({ ...INPUT, stateCode: '7' })).toThrow()
    expect(() => setupCompany({ ...INPUT, gstin: 'NOTAGSTIN' })).toThrow()
  })

  it('detects an existing company by name and owner email', () => {
    setupCompany(INPUT)
    expect(checkCompanyExists({ name: 'Acme Distributors', ownerEmail: 'owner@acme.in' })).toBe(
      true
    )
    expect(checkCompanyExists({ name: 'Other', ownerEmail: 'owner@acme.in' })).toBe(false)
  })
})

describe('login', () => {
  it('signs the owner in and rejects a wrong password', () => {
    setupCompany(INPUT)
    logout()
    expect(getAuthStatus()).toBe('LOGIN_REQUIRED')

    expect(() => login({ email: 'owner@acme.in', password: 'wrong' })).toThrow()
    const session = login({ email: 'OWNER@acme.in', password: 'correct-horse' })
    expect(session.companyName).toBe('Acme Distributors')
  })
})

describe('staff and permissions', () => {
  it('creates a billing clerk who cannot update the company', () => {
    setupCompany(INPUT)
    const created = createStaffMember({
      fullName: 'Asha Rao',
      email: 'asha@acme.in',
      password: 'billing-pass',
      roleName: 'Billing Clerk'
    })
    expect(created.userId).toBeGreaterThan(0)

    logout()
    login({ email: 'asha@acme.in', password: 'billing-pass' })
    expect(() => updateCompany({ name: 'Renamed' })).toThrow()
  })

  it('updates company fields and validates GSTIN', () => {
    setupCompany(INPUT)
    const updated = updateCompany({ name: 'Acme Traders', gstin: '27AABFU4477G1ZZ' })
    expect(updated.name).toBe('Acme Traders')
    expect(updated.gstin).toBe('27AABFU4477G1ZZ')
    expect(() => updateCompany({ gstin: '123' })).toThrow()
  })
})
