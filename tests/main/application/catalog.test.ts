import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  createCancellationPolicy,
  createOffer,
  createPlan,
  deactivateOffer,
  deletePlan,
  getAvailablePlans,
  listOfferVersions,
  listOffers,
  listPlanVersions,
  listPlans,
  listPolicyLookups,
  updateOffer,
  updatePlan
} from '../../../src/main/application/catalog'
import { createLead } from '../../../src/main/application/leads'
import { planRepo } from '../../../src/main/repositories/catalog'
import {
  organizationRepo,
  roleRepo,
  staffRepo,
  userRepo
} from '../../../src/main/repositories/identity'
import { setSession } from '../../../src/main/auth/session'
import type { SessionContext } from '../../../src/main/domain/identity'
import { getDb } from '../../../src/main/db/connection'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} from '../../../src/main/domain/errors'

setupSalesDb()

function createSourceId(organizationId: number): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_sources WHERE organization_id = ? ORDER BY sort_order LIMIT 1')
    .get(organizationId) as { id: number }
  return row.id
}

let signInCounter = 0
/** Creates a brand-new staff member in the given role and switches the session to them. */
function signInAs(organizationId: number, roleName: string): number {
  const org = organizationRepo.findById(organizationId)
  const user = userRepo.create({
    fullName: 'Sana Kapoor',
    email: `sana${++signInCounter}@fitgym.com`,
    passwordHash: 'h'
  })
  const role = roleRepo.findByName(organizationId, roleName)
  staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
  const session: SessionContext = {
    organizationId,
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
  return user.id
}

const VALID_PLAN = {
  name: 'Strength Bundle',
  description: 'Weights + HIIT zones.',
  duration: 'MONTHLY' as const,
  billingFrequency: 'ONE_TIME' as const,
  basePriceMinor: 220000,
  accessWindow: 'ALL_HOURS' as const,
  startTime: '06:00',
  endTime: '23:00',
  isActive: true
}

const VALID_OFFER = {
  name: 'New Year Offer',
  description: 'Welcome deal.',
  discountType: 'PERCENTAGE' as const,
  valueMinor: 20,
  applicablePlanIds: [] as number[],
  validFrom: '2026-01-01',
  active: true
}

describe('listPlans', () => {
  it('returns the orgs seeded catalog, scoped and free of foreign rows', () => {
    seedOrgWithSession() // a first org with its own plans
    const { organizationId: orgB } = seedOrgWithSession() // session now on org B

    const plans = listPlans()
    expect(plans).toHaveLength(3)
    expect(plans.every((p) => p.name && p.basePriceMinor > 0)).toBe(true)
    expect(plans.map((p) => p.id)).toEqual(planRepo.list(orgB).map((p) => p.id))
  })

  it('throws PERMISSION_DENIED without plan.view', () => {
    seedOrgWithSession('Front Desk')
    expect(() => listPlans()).toThrow(ForbiddenError)
  })
})

describe('createPlan', () => {
  it('creates a plan with a trimmed name and returns the row', () => {
    seedOrgWithSession()
    const created = createPlan({ ...VALID_PLAN, name: '  Strength Bundle  ' })
    expect(created).toMatchObject({
      id: expect.any(Number),
      name: 'Strength Bundle',
      basePriceMinor: 220000,
      isActive: true
    })
    const stored = getDb()
      .prepare('SELECT name FROM membership_plans WHERE id = ?')
      .get(created.id) as { name: string }
    expect(stored.name).toBe('Strength Bundle')
  })

  it('rejects a duplicate name case-insensitively with ConflictError', () => {
    seedOrgWithSession()
    expect(() => createPlan({ ...VALID_PLAN, name: 'annual' })).toThrow(ConflictError)
  })

  it('rejects a whitespace-only name with ValidationError', () => {
    seedOrgWithSession()
    expect(() => createPlan({ ...VALID_PLAN, name: '   ' })).toThrow(ValidationError)
  })

  it('denies creation without plan.create even with plan.view', () => {
    seedOrgWithSession('Sales')
    expect(() => createPlan(VALID_PLAN)).toThrow(ForbiddenError)
  })
})

describe('updatePlan', () => {
  it('updates a plans live terms and bumps updated_at', () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]

    const updated = updatePlan({
      planId: target.id,
      ...VALID_PLAN,
      name: 'Renamed Bundle',
      basePriceMinor: 250000,
      isActive: false
    })
    expect(updated).toMatchObject({ id: target.id, name: 'Renamed Bundle', isActive: false })
    const row = getDb()
      .prepare('SELECT name, base_price_minor FROM membership_plans WHERE id = ?')
      .get(target.id) as { name: string; base_price_minor: number }
    expect(row).toEqual({ name: 'Renamed Bundle', base_price_minor: 250000 })
  })

  it('throws NotFoundError for a plan in another organization', () => {
    const { organizationId: orgA } = seedOrgWithSession()
    const { organizationId: orgB } = seedOrgWithSession()
    const foreign = planRepo.list(orgB)[0]

    signInAs(orgA, 'Owner')
    expect(() => updatePlan({ planId: foreign.id, ...VALID_PLAN })).toThrow(NotFoundError)
  })

  it('allows keeping the same name but rejects another plans name', () => {
    const { organizationId } = seedOrgWithSession()
    const [first, second] = planRepo.list(organizationId)
    expect(() => updatePlan({ planId: first.id, ...VALID_PLAN, name: first.name })).not.toThrow()
    expect(() => updatePlan({ planId: first.id, ...VALID_PLAN, name: second.name })).toThrow(
      ConflictError
    )
  })

  it('denies updates without plan.update', () => {
    seedOrgWithSession('Sales')
    expect(() => updatePlan({ planId: 1, ...VALID_PLAN })).toThrow(ForbiddenError)
  })
})

describe('deletePlan', () => {
  it('hard-deletes an unreferenced plan', () => {
    const { organizationId } = seedOrgWithSession()
    const created = createPlan({ ...VALID_PLAN, name: 'Throwaway Plan' })

    expect(() => deletePlan({ planId: created.id })).not.toThrow()
    expect(planRepo.getById(organizationId, created.id)).toBeNull()
  })

  it('refuses to delete a plan referenced by leads with ConflictError', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const referenced = planRepo.list(organizationId)[0]
    createLead({
      fullName: 'Ravi Kumar',
      phone: '9876543210',
      sourceId,
      planId: referenced.id
    })

    expect(() => deletePlan({ planId: referenced.id })).toThrow(ConflictError)
    expect(planRepo.getById(organizationId, referenced.id)).not.toBeNull()
  })

  it('throws NotFoundError for a missing plan', () => {
    seedOrgWithSession()
    expect(() => deletePlan({ planId: 999999 })).toThrow(NotFoundError)
  })

  it('denies deletion without plan.deactivate', () => {
    seedOrgWithSession('Sales')
    expect(() => deletePlan({ planId: 1 })).toThrow(ForbiddenError)
  })
})

describe('updatePlan version history', () => {
  it('captures a version row with the outgoing price before the edit', () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    const oldPrice = target.basePriceMinor

    updatePlan({ planId: target.id, ...VALID_PLAN, name: target.name, basePriceMinor: 999999 })

    const versions = listPlanVersions({ planId: target.id })
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      planId: target.id,
      basePriceMinor: oldPrice,
      effectiveFrom: expect.any(String)
    })
  })

  it('returns versions oldest first across repeated edits', () => {
    const { organizationId } = seedOrgWithSession()
    const target = planRepo.list(organizationId)[0]
    const original = target.basePriceMinor
    updatePlan({ planId: target.id, ...VALID_PLAN, name: target.name, basePriceMinor: 111111 })
    updatePlan({ planId: target.id, ...VALID_PLAN, name: target.name, basePriceMinor: 222222 })

    const versions = listPlanVersions({ planId: target.id })
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => v.basePriceMinor)).toEqual([original, 111111])
  })

  it('denies listing without plan.view', () => {
    seedOrgWithSession('Front Desk')
    expect(() => listPlanVersions({ planId: 1 })).toThrow(ForbiddenError)
  })
})

describe('createOffer', () => {
  it('creates an offer with trimmed name and derived usedCount 0', () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: '  New Year Offer  ' })
    expect(created).toMatchObject({
      id: expect.any(Number),
      name: 'New Year Offer',
      discountType: 'PERCENTAGE',
      valueMinor: 20,
      active: true,
      usedCount: 0
    })
    expect(created.applicablePlanIds).toEqual([])
  })

  it('rejects a duplicate name case-insensitively with ConflictError', () => {
    seedOrgWithSession()
    createOffer({ ...VALID_OFFER, name: 'New Year Offer' })
    expect(() => createOffer({ ...VALID_OFFER, name: 'new year offer' })).toThrow(ConflictError)
  })

  it('rejects an out-of-range percentage with ValidationError', () => {
    seedOrgWithSession()
    expect(() => createOffer({ ...VALID_OFFER, valueMinor: 150 })).toThrow(ValidationError)
  })

  it('denies creation without offer.create', () => {
    seedOrgWithSession('Sales')
    expect(() => createOffer(VALID_OFFER)).toThrow(ForbiddenError)
  })
})

describe('listOffers', () => {
  it('lists offers with usage counts, scoped to the current org', () => {
    const { organizationId: orgA } = seedOrgWithSession()
    createOffer({ ...VALID_OFFER, name: 'Early Bird' })
    seedOrgWithSession()
    createOffer({ ...VALID_OFFER, name: 'Referral Bonus' })

    expect(listOffers().map((o) => o.name)).toEqual(['Referral Bonus'])

    signInAs(orgA, 'Owner')
    const offers = listOffers()
    expect(offers.map((o) => o.name)).toEqual(['Early Bird'])
    expect(offers[0]).toMatchObject({ usedCount: 0, active: true })
  })
})

describe('deactivateOffer', () => {
  it('soft-deactivates an offer, leaving the row in place', () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Flash Sale' })

    deactivateOffer({ offerId: created.id })

    const row = getDb().prepare('SELECT active FROM offers WHERE id = ?').get(created.id) as {
      active: number
    }
    expect(row.active).toBe(0)
    const offers = listOffers()
    expect(offers.find((o) => o.id === created.id)?.active).toBe(false)
  })

  it('throws NotFoundError for a missing offer', () => {
    seedOrgWithSession()
    expect(() => deactivateOffer({ offerId: 999999 })).toThrow(NotFoundError)
  })

  it('denies deactivation without offer.deactivate', () => {
    seedOrgWithSession('Sales')
    expect(() => deactivateOffer({ offerId: 1 })).toThrow(ForbiddenError)
  })
})

describe('updateOffer version history', () => {
  it('captures a version row with the outgoing discount on every edit', () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Early Bird' })

    updateOffer({
      offerId: created.id,
      ...VALID_OFFER,
      name: 'Early Bird',
      discountType: 'FIXED_AMOUNT',
      valueMinor: 50000
    })

    const versions = listOfferVersions({ offerId: created.id })
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      offerId: created.id,
      discountType: 'PERCENTAGE',
      valueMinor: 20,
      effectiveFrom: expect.any(String)
    })
  })

  it('captures a version even when only non-discount fields change', () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Early Bird' })

    updateOffer({
      offerId: created.id,
      ...VALID_OFFER,
      name: 'Early Bird Renamed'
    })

    const versions = listOfferVersions({ offerId: created.id })
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      discountType: 'PERCENTAGE',
      valueMinor: 20
    })
  })

  it('returns versions oldest first across repeated edits', () => {
    seedOrgWithSession()
    const created = createOffer({ ...VALID_OFFER, name: 'Early Bird' })
    updateOffer({
      offerId: created.id,
      ...VALID_OFFER,
      name: 'Early Bird',
      discountType: 'FIXED_AMOUNT',
      valueMinor: 50000
    })
    updateOffer({
      offerId: created.id,
      ...VALID_OFFER,
      name: 'Early Bird',
      discountType: 'PERCENTAGE',
      valueMinor: 30
    })

    const versions = listOfferVersions({ offerId: created.id })
    expect(versions).toHaveLength(2)
    expect(versions.map((v) => v.discountType)).toEqual(['PERCENTAGE', 'FIXED_AMOUNT'])
    expect(versions.map((v) => v.valueMinor)).toEqual([20, 50000])
  })

  it('denies listing without offer.view', () => {
    seedOrgWithSession('Front Desk')
    expect(() => listOfferVersions({ offerId: 1 })).toThrow(ForbiddenError)
  })
})

describe('listPolicyLookups', () => {
  it('returns the three seeded policy sets with default plans attached', () => {
    const { organizationId } = seedOrgWithSession()
    const lookups = listPolicyLookups()
    expect(lookups.freezePolicies).toHaveLength(3)
    expect(lookups.prorationPolicies).toHaveLength(3)
    expect(lookups.cancellationPolicies).toHaveLength(3)

    const plans = planRepo.list(organizationId)
    expect(plans.every((p) => p.freezePolicyId !== null)).toBe(true)
    expect(plans.every((p) => p.prorationPolicyId !== null)).toBe(true)
    expect(plans.every((p) => p.cancellationPolicyId !== null)).toBe(true)
  })

  it('denies without plan.view', () => {
    seedOrgWithSession('Front Desk')
    expect(() => listPolicyLookups()).toThrow(ForbiddenError)
  })
})

describe('createCancellationPolicy', () => {
  it('creates a notice-period policy when noticeDays is present', () => {
    seedOrgWithSession()
    const created = createCancellationPolicy({
      name: 'Two Weeks Notice',
      effectiveRule: 'NOTICE_DAYS',
      noticeDays: 14,
      description: 'Requires advance notice.'
    })
    expect(created).toMatchObject({
      name: 'Two Weeks Notice',
      effectiveRule: 'NOTICE_DAYS',
      noticeDays: 14
    })
  })

  it('rejects NOTICE_DAYS without noticeDays with ValidationError', () => {
    seedOrgWithSession()
    expect(() =>
      createCancellationPolicy({ name: 'Bad Notice', effectiveRule: 'NOTICE_DAYS' })
    ).toThrow(ValidationError)
  })

  it('rejects a duplicate policy name with ConflictError', () => {
    seedOrgWithSession()
    expect(() =>
      createCancellationPolicy({ name: 'end of period', effectiveRule: 'IMMEDIATE' })
    ).toThrow(ConflictError)
  })

  it('denies creation without settings.manage', () => {
    seedOrgWithSession('Manager')
    expect(() =>
      createCancellationPolicy({ name: 'Manager Policy', effectiveRule: 'IMMEDIATE' })
    ).toThrow(ForbiddenError)
  })
})

describe('getAvailablePlans', () => {
  it('excludes plans with available_to in the past', () => {
    seedOrgWithSession()
    createPlan({ ...VALID_PLAN, name: 'Expired Plan', availableTo: '2020-01-01' })
    const available = getAvailablePlans()
    expect(available.every((p) => p.name !== 'Expired Plan')).toBe(true)
  })

  it('excludes plans with available_from in the future', () => {
    seedOrgWithSession()
    createPlan({ ...VALID_PLAN, name: 'Future Plan', availableFrom: '2099-01-01' })
    const available = getAvailablePlans()
    expect(available.every((p) => p.name !== 'Future Plan')).toBe(true)
  })

  it('includes plans with available_to = NULL (open-ended)', () => {
    seedOrgWithSession()
    createPlan({ ...VALID_PLAN, name: 'Open Plan', availableTo: null })
    const available = getAvailablePlans()
    expect(available.some((p) => p.name === 'Open Plan')).toBe(true)
  })

  it('defaults available_from to today when creating a plan', () => {
    seedOrgWithSession()
    const today = new Date().toISOString().slice(0, 10)
    const created = createPlan(VALID_PLAN)
    expect(created.availableFrom).toBe(today)
  })

  it('does not affect existing memberships when changing plan availability', () => {
    seedOrgWithSession()
    const plan = createPlan(VALID_PLAN)
    const before = listPlans().find((p) => p.id === plan.id)
    updatePlan({
      planId: plan.id,
      ...VALID_PLAN,
      availableFrom: '2020-01-01',
      availableTo: '2020-12-31'
    })
    const after = listPlans().find((p) => p.id === plan.id)
    expect(after?.availableFrom).toBe('2020-01-01')
    expect(after?.availableTo).toBe('2020-12-31')
    expect(before?.basePriceMinor).toBe(after?.basePriceMinor)
  })
})
