import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import { getDb } from '../../src/main/db/connection'
import {
  seedPermissions,
  seedRolesForOrganization,
  seedPlansForOrganization,
  seedOffersForOrganization,
  SEED_ROLES,
  SEED_PLANS,
  SEED_OFFERS
} from '../../src/main/db/seed'
import { ALL_PERMISSION_CODES } from '../../src/main/db/permissions'
import { organizationRepo, roleRepo } from '../../src/main/repositories/identity'

setupTestDb()

describe('seedPermissions', () => {
  it('inserts the full catalog', () => {
    const count = (
      getDb().prepare('SELECT COUNT(*) AS n FROM permissions').get() as {
        n: number
      }
    ).n
    expect(count).toBe(ALL_PERMISSION_CODES.length)
  })

  it('is idempotent — running twice does not duplicate codes', () => {
    seedPermissions()
    seedPermissions()
    const count = (
      getDb().prepare('SELECT COUNT(*) AS n FROM permissions').get() as {
        n: number
      }
    ).n
    expect(count).toBe(ALL_PERMISSION_CODES.length)
  })
})

describe('seedRolesForOrganization', () => {
  function seedOrg(): number {
    const org = organizationRepo.create({
      slug: 'test-gym',
      name: 'Test Gym',
      mobileNumber: '9876543210',
      currency: 'INR'
    })
    seedRolesForOrganization(org.id)
    return org.id
  }

  it('creates every starter role', () => {
    const orgId = seedOrg()
    const roles = getDb()
      .prepare('SELECT name FROM roles WHERE organization_id = ?')
      .all(orgId) as { name: string }[]
    expect(roles.map((r) => r.name).sort()).toEqual(SEED_ROLES.map((r) => r.name).sort())
  })

  it('marks Owner and Admin as system + super', () => {
    const orgId = seedOrg()
    const system = getDb()
      .prepare(
        'SELECT name, is_system_role, is_super FROM roles WHERE organization_id = ? AND is_system_role = 1'
      )
      .all(orgId) as { name: string; is_system_role: number; is_super: number }[]
    expect(system.map((r) => r.name).sort()).toEqual(['Admin', 'Owner'])
    for (const role of system) {
      expect(role.is_super).toBe(1)
    }
  })

  it('keeps other roles non-system and non-super', () => {
    const orgId = seedOrg()
    const others = getDb()
      .prepare(
        'SELECT name, is_system_role, is_super FROM roles WHERE organization_id = ? AND is_system_role = 0'
      )
      .all(orgId) as { name: string; is_system_role: number; is_super: number }[]
    expect(others.length).toBeGreaterThan(0)
    for (const role of others) {
      expect(role.is_super).toBe(0)
    }
  })

  it('returns all catalog permissions for a super role', () => {
    const orgId = seedOrg()
    const owner = getDb()
      .prepare("SELECT id FROM roles WHERE organization_id = ? AND name = 'Owner'")
      .get(orgId) as { id: number }
    expect(roleRepo.findPermissionCodes(owner.id).sort()).toEqual([...ALL_PERMISSION_CODES].sort())
  })

  it('grants a non-super role exactly its configured permissions', () => {
    const orgId = seedOrg()
    const manager = getDb()
      .prepare("SELECT id FROM roles WHERE organization_id = ? AND name = 'Manager'")
      .get(orgId) as { id: number }
    const expected = SEED_ROLES.find((r) => r.name === 'Manager')!.permissions
    expect(roleRepo.findPermissionCodes(manager.id).sort()).toEqual([...expected].sort())
  })
})

describe('seedPlansForOrganization', () => {
  function seedOrg(): number {
    const org = organizationRepo.create({
      slug: 'test-gym',
      name: 'Test Gym',
      mobileNumber: '9876543210',
      currency: 'INR'
    })
    seedPlansForOrganization(org.id)
    return org.id
  }

  it('seeds exactly the starter plans', () => {
    const orgId = seedOrg()
    const plans = getDb()
      .prepare('SELECT name FROM membership_plans WHERE organization_id = ?')
      .all(orgId) as { name: string }[]
    expect(plans.map((p) => p.name).sort()).toEqual(SEED_PLANS.map((p) => p.name).sort())
    expect(plans).toHaveLength(3)
  })

  it('stores duration, billing, and price in minor units', () => {
    const orgId = seedOrg()
    const rows = getDb()
      .prepare(
        'SELECT name, duration, billing_frequency, base_price_minor FROM membership_plans WHERE organization_id = ?'
      )
      .all(orgId) as {
      name: string
      duration: string
      billing_frequency: string
      base_price_minor: number
    }[]
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(byName['Annual']).toMatchObject({
      duration: 'YEARLY',
      billing_frequency: 'YEARLY',
      base_price_minor: 800000
    })
    expect(byName['Quarterly']).toMatchObject({
      duration: 'QUARTERLY',
      billing_frequency: 'QUARTERLY',
      base_price_minor: 400000
    })
    expect(byName['Monthly']).toMatchObject({
      duration: 'MONTHLY',
      billing_frequency: 'ONE_TIME',
      base_price_minor: 500000
    })
  })

  it('is guarded against double-seeding by the (org, name) unique constraint', () => {
    const orgId = seedOrg()
    expect(() => seedPlansForOrganization(orgId)).toThrow()
  })
})

describe('seedOffersForOrganization', () => {
  function seedOrg(): number {
    const org = organizationRepo.create({
      slug: 'test-gym',
      name: 'Test Gym',
      mobileNumber: '9876543210',
      currency: 'INR'
    })
    seedOffersForOrganization(org.id)
    return org.id
  }

  it('seeds BARGAINING_DISCOUNT with a 10% percentage discount', () => {
    const orgId = seedOrg()
    const rows = getDb()
      .prepare(
        'SELECT name, description, discount_type, value_minor, applicable_plan_ids, valid_to, max_usage, min_purchase_minor, active FROM offers WHERE organization_id = ?'
      )
      .all(orgId) as {
      name: string
      description: string
      discount_type: string
      value_minor: number
      applicable_plan_ids: string
      valid_to: string | null
      max_usage: number | null
      min_purchase_minor: number | null
      active: number
    }[]
    expect(rows).toHaveLength(SEED_OFFERS.length)
    const offer = rows.find((r) => r.name === 'BARGAINING_DISCOUNT')!
    expect(offer.description).toBe(
      'Use this when customer is bargaining while creating invoice.'
    )
    expect(offer.discount_type).toBe('PERCENTAGE')
    expect(offer.value_minor).toBe(10)
    expect(offer.applicable_plan_ids).toBe('[]')
    expect(offer.valid_to).toBeNull()
    expect(offer.max_usage).toBeNull()
    expect(offer.min_purchase_minor).toBeNull()
    expect(offer.active).toBe(1)
  })

  it('is guarded against double-seeding by the (org, name) unique constraint', () => {
    const orgId = seedOrg()
    expect(() => seedOffersForOrganization(orgId)).toThrow()
  })
})
