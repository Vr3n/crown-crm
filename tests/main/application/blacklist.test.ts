import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  bulkCompleteFollowUps,
  bulkMoveLeadStage,
  bulkScheduleFollowUp,
  completeFollowUp,
  createLead,
  moveLeadStage,
  recordLeadActivity,
  scheduleFollowUp
} from '../../../src/main/application/leads'
import { renewMembership, sellMembership } from '../../../src/main/application/memberships'
import {
  assertPersonAllowed,
  blacklistPerson,
  unblacklistPerson
} from '../../../src/main/application/blacklist'
import { createInvoice } from '../../../src/main/application/billing'
import {
  applyCredit,
  issueCredit,
  issueRefund,
  recordPayment
} from '../../../src/main/application/finance'
import { getDb, getDrizzle } from '../../../src/main/db/connection'
import { memberships, people, membershipPlans } from '../../../src/main/db/schema'
import {
  BlacklistedPersonError,
  NotFoundError,
  ValidationError,
  ForbiddenError
} from '../../../src/main/domain/errors'
import { setSession } from '../../../src/main/auth/session'
import { roleRepo } from '../../../src/main/repositories/identity'
import { activityTypeRepo, leadRepo } from '../../../src/main/repositories/sales'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'
import type { SessionContext } from '../../../src/main/domain/identity'

setupSalesDb()

function createLeadForSale(): { organizationId: number; leadId: number; personId: number } {
  const { organizationId } = seedOrgWithSession()
  const lead = createLead({
    fullName: 'Blacklist Test Customer',
    phone: '9876543210',
    sourceId: 1
  })
  return { organizationId, leadId: lead.leadId, personId: lead.personId }
}

function saleInput(leadId: number, transactionId: string): SellMembershipInput {
  const plan = getDrizzle()
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(eq(membershipPlans.name, 'Monthly'))
    .get()!
  return {
    leadId,
    planId: plan.id,
    offerId: null,
    joiningDate: '2026-08-25',
    startDate: '2026-08-25',
    endDate: '2026-11-22',
    issueDate: '2026-08-25',
    basePriceMinor: 150_000,
    discountType: 'NONE' as const,
    discountValueMinor: null,
    paidAmountMinor: 50_000,
    paymentMethod: 'UPI' as const,
    transactionId
  }
}

describe('blacklistPerson', () => {
  it('blacklists a person and records reason, timestamp, and user', () => {
    const { personId } = createLeadForSale()
    const result = blacklistPerson({ personId, reason: 'Bad behavior' })

    expect(result.personId).toBe(personId)
    expect(result.isBlacklisted).toBe(true)

    const db = getDrizzle()
    const person = db.select().from(people).where(eq(people.id, personId)).get()!
    expect(person.is_blacklisted).toBe(true)
    expect(person.blacklisted_reason).toBe('Bad behavior')
    expect(person.blacklisted_at).toBeTruthy()
    expect(person.blacklisted_by).toBeGreaterThan(0)
  })

  it('rejects blacklisting an already blacklisted person', () => {
    const { personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'First' })
    expect(() => blacklistPerson({ personId, reason: 'Second' })).toThrow(ValidationError)
  })

  it('rejects blacklisting a non-existent person', () => {
    expect(() => blacklistPerson({ personId: 99999, reason: 'test' })).toThrow()
  })

  it('rejects blacklisting without person.blacklist permission', () => {
    const { organizationId, personId } = createLeadForSale()
    const role = roleRepo.findByName(organizationId, 'Front Desk')!
    const session: SessionContext = {
      organizationId,
      organizationSlug: 'test',
      organizationName: 'Test',
      userId: 1,
      userFullName: 'Test',
      userEmail: 'test@test.com',
      roleId: role.id,
      roleName: role.name,
      isSuper: role.isSuper,
      permissions: []
    }
    setSession(session)
    expect(() => blacklistPerson({ personId, reason: 'test' })).toThrow(ForbiddenError)
  })
})

describe('unblacklistPerson', () => {
  it('unblacklists a blacklisted person and clears all fields', () => {
    const { personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'test' })
    const result = unblacklistPerson({ personId })

    expect(result.personId).toBe(personId)
    expect(result.isBlacklisted).toBe(false)

    const db = getDrizzle()
    const person = db.select().from(people).where(eq(people.id, personId)).get()!
    expect(person.is_blacklisted).toBe(false)
    expect(person.blacklisted_reason).toBeNull()
    expect(person.blacklisted_at).toBeNull()
    expect(person.blacklisted_by).toBeNull()
  })

  it('rejects unblacklisting a person who is not blacklisted', () => {
    const { personId } = createLeadForSale()
    expect(() => unblacklistPerson({ personId })).toThrow(ValidationError)
  })
})

describe('blacklist enforcement in sellMembership', () => {
  it('blocks membership sale to a blacklisted person', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      sellMembership(saleInput(leadId, '00000000-0000-4000-8000-000000000010'))
    ).toThrow(BlacklistedPersonError)

    const db = getDrizzle()
    expect(db.select().from(memberships).all()).toHaveLength(0)
  })

  it('allows membership sale after blacklist is lifted', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'test' })
    unblacklistPerson({ personId })

    const result = sellMembership(
      saleInput(leadId, '00000000-0000-4000-8000-000000000011')
    )
    expect(result.membershipId).toBeGreaterThan(0)
  })
})

describe('refund-only rule', () => {
  function stageIdByName(organizationId: number, name: string): number {
    return (
      getDb()
        .prepare('SELECT id FROM lead_stages WHERE organization_id = ? AND name = ?')
        .get(organizationId, name) as { id: number }
    ).id
  }

  function blacklistedSaleFixture(): {
    organizationId: number
    leadId: number
    personId: number
    customerId: number
    paymentId: number
  } {
    const { organizationId } = seedOrgWithSession()
    const lead = createLead({
      fullName: 'Refund Only Customer',
      phone: '9876543210',
      sourceId: 1
    })
    const sale = sellMembership(saleInput(lead.leadId, '00000000-0000-4000-8000-000000000020'))
    blacklistPerson({ personId: lead.personId, reason: 'Fraud' })
    return {
      organizationId,
      leadId: lead.leadId,
      personId: lead.personId,
      customerId: sale.customerId,
      paymentId: sale.paymentId
    }
  }

  function phoneCallTypeId(organizationId: number): number {
    return activityTypeRepo.findByName(organizationId, 'PHONE_CALL')!.id
  }

  it('assertPersonAllowed throws for blacklisted, passes for clean, NotFound for unknown', () => {
    const { organizationId, personId } = createLeadForSale()
    expect(() => assertPersonAllowed(organizationId, personId, 'test action')).not.toThrow()
    blacklistPerson({ personId, reason: 'test' })
    expect(() => assertPersonAllowed(organizationId, personId, 'test action')).toThrow(
      BlacklistedPersonError
    )
    expect(() => assertPersonAllowed(organizationId, 99999, 'test action')).toThrow(NotFoundError)
  })

  it('blocks creating a lead for a blacklisted person', () => {
    const { personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      createLead({ fullName: 'Same Person', phone: '9876543210', sourceId: 1 })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks scheduling a follow-up for a blacklisted lead', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      scheduleFollowUp({
        leadId,
        title: 'Call back',
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks recording an activity for a blacklisted lead', () => {
    const { organizationId, leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      recordLeadActivity({
        leadId,
        typeId: phoneCallTypeId(organizationId),
        note: 'Called',
        occurredAt: new Date().toISOString()
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks moving a blacklisted lead', () => {
    const { organizationId } = seedOrgWithSession()
    const lead = createLead({
      fullName: 'Move Block Customer',
      phone: '9876543211',
      sourceId: 1
    })
    const activity = recordLeadActivity({
      leadId: lead.leadId,
      typeId: phoneCallTypeId(organizationId),
      note: 'Spoke',
      occurredAt: new Date().toISOString()
    })
    blacklistPerson({ personId: lead.personId, reason: 'Fraud' })

    expect(() =>
      moveLeadStage({
        leadId: lead.leadId,
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: stageIdByName(organizationId, 'NEW'),
        activityId: activity.activityId
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks completing a follow-up for a blacklisted lead', () => {
    const { leadId, personId } = createLeadForSale()
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() => completeFollowUp({ followupId })).toThrow(BlacklistedPersonError)
  })

  it('blocks bulk moves touching a blacklisted lead and moves nothing', () => {
    const { organizationId } = seedOrgWithSession()
    const ok = createLead({ fullName: 'Ok Lead', phone: '9876543212', sourceId: 1 })
    const bad = createLead({ fullName: 'Bad Lead', phone: '9876543213', sourceId: 1 })
    blacklistPerson({ personId: bad.personId, reason: 'Fraud' })

    expect(() =>
      bulkMoveLeadStage({
        leadIds: [ok.leadId, bad.leadId],
        targetStageId: stageIdByName(organizationId, 'CONTACTED')
      })
    ).toThrow(BlacklistedPersonError)
    expect(leadRepo.getById(organizationId, ok.leadId)!.currentStageId).toBe(
      stageIdByName(organizationId, 'NEW')
    )
  })

  it('blocks bulk scheduling for a blacklisted lead', () => {
    const { leadId, personId } = createLeadForSale()
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() =>
      bulkScheduleFollowUp({
        leadIds: [leadId],
        title: 'Wave',
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks renewing a membership for a blacklisted customer', () => {
    const { customerId } = blacklistedSaleFixture()
    const plan = getDrizzle()
      .select({ id: membershipPlans.id })
      .from(membershipPlans)
      .where(eq(membershipPlans.name, 'Monthly'))
      .get()!

    expect(() =>
      renewMembership({
        customerId,
        sourceMembershipId: 1,
        planId: plan.id,
        offerId: null,
        joiningDate: '2026-11-23',
        startDate: '2026-11-23',
        endDate: '2027-02-22',
        issueDate: '2026-11-23',
        basePriceMinor: 150_000,
        discountType: 'NONE',
        discountValueMinor: null,
        paidAmountMinor: 150_000,
        paymentMethod: 'UPI',
        transactionId: '00000000-0000-4000-8000-000000000021'
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks recording a payment for a blacklisted customer', () => {
    const { customerId } = blacklistedSaleFixture()

    expect(() =>
      recordPayment({
        customerId,
        paymentDate: '2026-08-21',
        amountMinor: 50000,
        paymentMethod: 'UPI'
      })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks creating an invoice for a blacklisted customer', () => {
    const { customerId } = blacklistedSaleFixture()

    expect(() => createInvoice({ customerId })).toThrow(BlacklistedPersonError)
  })

  it('still allows a refund for a blacklisted customer', () => {
    const { paymentId } = blacklistedSaleFixture()

    const refund = issueRefund({ paymentId, amountMinor: 10000, reason: 'Goodwill refund' })

    expect(refund.amountMinor).toBe(10000)
  })

  it('blocks bulk completion without a stage change for a blacklisted lead', () => {
    const { leadId, personId } = createLeadForSale()
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    blacklistPerson({ personId, reason: 'Fraud' })

    expect(() => bulkCompleteFollowUps({ followUpIds: [followupId] })).toThrow(
      BlacklistedPersonError
    )
    const followup = getDb()
      .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
      .get(followupId) as { completed_at: string | null }
    expect(followup.completed_at).toBeNull()
  })

  it('blocks issuing a credit for a blacklisted customer', () => {
    const { customerId } = blacklistedSaleFixture()

    expect(() =>
      issueCredit({ customerId, amountMinor: 5000, reason: 'Goodwill' })
    ).toThrow(BlacklistedPersonError)
  })

  it('blocks applying a credit for a blacklisted customer', () => {
    const { organizationId } = seedOrgWithSession()
    const lead = createLead({
      fullName: 'Credit Block Customer',
      phone: '9876543216',
      sourceId: 1
    })
    const sale = sellMembership(saleInput(lead.leadId, '00000000-0000-4000-8000-000000000022'))
    const credit = issueCredit({
      customerId: sale.customerId,
      amountMinor: 5000,
      reason: 'Goodwill'
    })
    blacklistPerson({ personId: lead.personId, reason: 'Fraud' })
    void organizationId

    expect(() =>
      applyCredit({ creditId: credit.id, invoiceId: sale.invoiceId, amountMinor: 5000 })
    ).toThrow(BlacklistedPersonError)
  })
})
