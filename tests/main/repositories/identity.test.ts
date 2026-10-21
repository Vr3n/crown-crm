import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupTestDb } from '../../helpers/db'
import { getDrizzle } from '../../../src/main/db/connection'
import { companyRepo, roleRepo, staffRepo, userRepo } from '../../../src/main/repositories/identity'
import type { Company } from '../../../src/main/domain/identity'
import { seedRolesForCompany } from '../../../src/main/db/seed'
import { companyUsers } from '../../../src/main/db/schema'

setupTestDb()

function createCompany(name = 'Acme'): Company {
  return companyRepo.create({
    slug: name.toLowerCase(),
    name,
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  })
}

describe('companyRepo', () => {
  it('creates and reads a company with camelCase fields', () => {
    const company = createCompany()
    expect(company.name).toBe('Acme')
    expect(company.stateCode).toBe('27')
    expect(company.booksBeginDate).toBe('2026-04-01')
    expect(company.costingMethod).toBe('WEIGHTED_AVERAGE')
    expect(company.roundOffMode).toBe('INVOICE')
    expect(company.allowNegativeStock).toBe(true)

    const read = companyRepo.findById(company.id)
    expect(read).toEqual(company)
  })

  it('applies patch updates and clears nullable fields explicitly', () => {
    const company = createCompany()
    companyRepo.update(company.id, { legalName: 'Acme Pvt Ltd', gstin: '27AABFU4477G1ZY' })
    let read = companyRepo.findById(company.id)
    expect(read?.legalName).toBe('Acme Pvt Ltd')

    companyRepo.update(company.id, { legalName: null })
    read = companyRepo.findById(company.id)
    expect(read?.legalName).toBeNull()
    expect(read?.gstin).toBe('27AABFU4477G1ZY')

    companyRepo.update(company.id, { costingMethod: 'FIFO', roundOffMode: 'LINE' })
    read = companyRepo.findById(company.id)
    expect(read?.costingMethod).toBe('FIFO')
    expect(read?.roundOffMode).toBe('LINE')
  })

  it('counts and lists companies', () => {
    expect(companyRepo.count()).toBe(0)
    createCompany('One')
    createCompany('Two')
    expect(companyRepo.count()).toBe(2)
    expect(companyRepo.findAll()).toHaveLength(2)
  })

  it('finds a company by owner email', () => {
    const company = createCompany()
    seedRolesForCompany(company.id)
    const owner = roleRepo.findByName(company.id, 'Owner')!
    const user = userRepo.create({
      fullName: 'Owner',
      email: 'OWNER@acme.in',
      passwordHash: 'x'
    })
    staffRepo.create({ companyId: company.id, userId: user.id, roleId: owner.id })

    expect(companyRepo.existsWithOwnerCredentials({ name: 'Acme', email: 'owner@acme.in' })).toBe(
      true
    )
    expect(companyRepo.existsWithOwnerCredentials({ name: 'Other', email: 'owner@acme.in' })).toBe(
      false
    )
  })
})

describe('roleRepo', () => {
  it('finds a role by name and returns the catalog for a super role', () => {
    const company = createCompany()
    seedRolesForCompany(company.id)
    const owner = roleRepo.findByName(company.id, 'Owner')
    expect(owner?.isSuper).toBe(true)
    expect(roleRepo.findPermissionCodes(owner!.id).length).toBeGreaterThan(20)
    expect(roleRepo.listByCompany(company.id)).toHaveLength(5)
  })
})

describe('staffRepo', () => {
  it('creates a membership and resolves it by email and by pair', () => {
    const company = createCompany()
    seedRolesForCompany(company.id)
    const clerk = roleRepo.findByName(company.id, 'Billing Clerk')!
    const user = userRepo.create({
      fullName: 'Asha',
      email: 'asha@acme.in',
      passwordHash: 'hash'
    })
    staffRepo.create({ companyId: company.id, userId: user.id, roleId: clerk.id })

    expect(staffRepo.emailExistsInCompany(company.id, 'ASHA@acme.in')).toBe(true)
    expect(staffRepo.findActiveForLogin(company.id, 'asha@acme.in')?.role.name).toBe(
      'Billing Clerk'
    )
    expect(staffRepo.findActiveMembership(company.id, user.id)?.roleName).toBe('Billing Clerk')
  })

  it('hides a membership once the row is inactive', () => {
    const company = createCompany()
    seedRolesForCompany(company.id)
    const owner = roleRepo.findByName(company.id, 'Owner')!
    const user = userRepo.create({ fullName: 'Owner', email: 'o@acme.in', passwordHash: 'x' })
    staffRepo.create({ companyId: company.id, userId: user.id, roleId: owner.id })

    getDrizzle()
      .update(companyUsers)
      .set({ status: 'DISABLED' })
      .where(eq(companyUsers.user_id, user.id))
      .run()

    expect(staffRepo.findActiveMembership(company.id, user.id)).toBeNull()
  })
})
