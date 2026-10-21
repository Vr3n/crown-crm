import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import {
  organizationRepo,
  userRepo,
  roleRepo,
  staffRepo
} from '../../../src/main/repositories/identity'
import { personRepo } from '../../../src/main/repositories/sales'
import { planRepo } from '../../../src/main/repositories/catalog'
import {
  customerRepo,
  membershipRepo,
  freezeRepo,
  membershipEventRepo
} from '../../../src/main/repositories/membership'
import { seedRolesForOrganization } from '../../../src/main/db/seed'

setupTestDb()

function createOrgAndUser(): {
  org: ReturnType<typeof organizationRepo.create>
  user: ReturnType<typeof userRepo.create>
} {
  const org = organizationRepo.create({
    slug: 'fit-gym',
    name: 'Fit Gym',
    mobileNumber: '9876543210',
    currency: 'INR'
  })
  seedRolesForOrganization(org.id)
  const role = roleRepo.findByName(org.id, 'Owner')!
  const user = userRepo.create({
    fullName: 'Test User',
    email: 'test@fitgym.com',
    passwordHash: 'hash'
  })
  staffRepo.create({ organizationId: org.id, userId: user.id, roleId: role.id })
  return { org, user }
}

function createTestPerson(organizationId: number): ReturnType<typeof personRepo.create> {
  return personRepo.create({
    organizationId,
    fullName: 'Test Customer',
    phone: '9876543210',
    email: 'test@test.com'
  })
}

function createTestPlan(organizationId: number): ReturnType<typeof planRepo.create> {
  return planRepo.create({
    organizationId,
    name: 'Monthly Plan',
    description: 'Basic monthly plan',
    duration: 'MONTHLY',
    billingFrequency: 'ONE_TIME',
    basePriceMinor: 100000,
    accessWindow: 'ALL_HOURS',
    startTime: null,
    endTime: null,
    taxCode: null,
    taxRateBps: 1800,
    registrationFeeMinor: 0,
    freezePolicyId: null,
    prorationPolicyId: null,
    cancellationPolicyId: null,
    active: true
  })
}

describe('customerRepo', () => {
  it('creates and reads a customer', () => {
    const { org } = createOrgAndUser()
    const person = createTestPerson(org.id)

    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: 'Ravi Kumar',
      billingPhone: '9876543210',
      billingEmail: 'ravi@test.com',
      billingAddress: '123 Main St',
      emergencyContact: '9876543211',
      notes: 'VIP'
    })

    expect(customer.id).toBeGreaterThan(0)
    expect(customer).toMatchObject({
      organizationId: org.id,
      personId: person.id,
      billingName: 'Ravi Kumar',
      billingPhone: '9876543210'
    })

    const found = customerRepo.getById(org.id, customer.id)
    expect(found).toEqual(customer)
  })

  it('finds customer by person ID', () => {
    const { org } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })

    const found = customerRepo.getByPersonId(org.id, person.id)
    expect(found?.id).toBe(customer.id)
    expect(customerRepo.getByPersonId(org.id, 99999)).toBeNull()
  })

  it('updates customer billing info', () => {
    const { org } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: 'Old Name',
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })

    customerRepo.update(org.id, customer.id, {
      billingName: 'New Name',
      billingPhone: '1234567890',
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })

    const updated = customerRepo.getById(org.id, customer.id)
    expect(updated?.billingName).toBe('New Name')
    expect(updated?.billingPhone).toBe('1234567890')
  })
})

describe('membershipRepo', () => {
  it('creates and reads a membership', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)

    const membership = membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'ACTIVE',
      createdBy: user.id
    })

    expect(membership.id).toBeGreaterThan(0)
    expect(membership).toMatchObject({
      organizationId: org.id,
      customerId: customer.id,
      planNameSnapshot: 'Monthly Plan',
      status: 'ACTIVE'
    })

    const found = membershipRepo.getById(org.id, membership.id)
    expect(found).toEqual(membership)
  })

  it('finds active membership by date', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)

    membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'ACTIVE',
      createdBy: user.id
    })

    const found = membershipRepo.getActiveByDate(org.id, customer.id, '2026-08-15')
    expect(found).not.toBeNull()
    expect(found?.status).toBe('ACTIVE')

    expect(membershipRepo.getActiveByDate(org.id, customer.id, '2026-07-15')).toBeNull()
  })

  it('updates membership status', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)

    const membership = membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'PENDING',
      createdBy: user.id
    })

    membershipRepo.updateStatus(org.id, membership.id, 'ACTIVE')
    const updated = membershipRepo.getById(org.id, membership.id)
    expect(updated?.status).toBe('ACTIVE')
  })
})

describe('freezeRepo', () => {
  it('creates and reads freezes', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)
    const membership = membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'ACTIVE',
      createdBy: user.id
    })

    const freeze = freezeRepo.create({
      organizationId: org.id,
      membershipId: membership.id,
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      reason: 'Vacation',
      feeMinor: 50000,
      billingBehavior: 'CHARGE_FEE',
      accessBehavior: 'BLOCK',
      extensionDays: 10,
      creditDays: 0,
      createdBy: user.id
    })

    expect(freeze.id).toBeGreaterThan(0)
    expect(freeze).toMatchObject({
      membershipId: membership.id,
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      billingBehavior: 'CHARGE_FEE',
      extensionDays: 10
    })

    const freezes = freezeRepo.getByMembership(org.id, membership.id)
    expect(freezes).toHaveLength(1)
  })

  it('finds active freeze by date', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)
    const membership = membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'ACTIVE',
      createdBy: user.id
    })

    freezeRepo.create({
      organizationId: org.id,
      membershipId: membership.id,
      startDate: '2026-08-10',
      endDate: '2026-08-20',
      reason: null,
      feeMinor: 0,
      billingBehavior: 'CHARGE_FEE',
      accessBehavior: 'BLOCK',
      extensionDays: 0,
      creditDays: 0,
      createdBy: user.id
    })

    expect(freezeRepo.getActiveFreeze(org.id, membership.id, '2026-08-15')).not.toBeNull()
    expect(freezeRepo.getActiveFreeze(org.id, membership.id, '2026-08-05')).toBeNull()
    expect(freezeRepo.getActiveFreeze(org.id, membership.id, '2026-08-25')).toBeNull()
  })
})

describe('membershipEventRepo', () => {
  it('creates and lists events', () => {
    const { org, user } = createOrgAndUser()
    const person = createTestPerson(org.id)
    const customer = customerRepo.create({
      organizationId: org.id,
      personId: person.id,
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const plan = createTestPlan(org.id)
    const membership = membershipRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      planId: plan.id,
      offerId: null,
      planNameSnapshot: 'Monthly Plan',
      durationDaysSnapshot: 30,
      basePriceMinor: 100000,
      discountMinor: 0,
      finalPriceMinor: 100000,
      taxRateBps: 1800,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      billingFrequency: 'ONE_TIME',
      status: 'ACTIVE',
      createdBy: user.id
    })

    membershipEventRepo.create({
      organizationId: org.id,
      membershipId: membership.id,
      type: 'CREATED',
      data: JSON.stringify({ planName: 'Monthly Plan' }),
      createdBy: user.id
    })

    const events = membershipEventRepo.listByMembership(org.id, membership.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('CREATED')
  })
})
