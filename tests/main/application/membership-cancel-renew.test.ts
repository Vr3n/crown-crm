import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { createLead } from '../../../src/main/application/leads'
import {
  sellMembership,
  cancelMembership,
  revertCancellationRequest,
  renewMembership
} from '../../../src/main/application/memberships'
import { processScheduledRefunds } from '../../../src/main/application/finance'
import { refundRepo } from '../../../src/main/repositories/finance'
import { getDrizzle } from '../../../src/main/db/connection'
import {
  memberships,
  membershipEvents,
  membershipPlans,
  refunds,
  invoices
} from '../../../src/main/db/schema'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'

setupSalesDb()

// Every expectation in this file is anchored to "today" = 2026-09-08 (sale
// window 2026-08-25 → 2026-11-22, notice math, effective dates). Freeze the
// clock so the suite is independent of the real calendar day. Noon UTC keeps
// the UTC calendar day stable in every timezone (the app derives today from
// `new Date().toISOString()`).
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function createLeadForSale(): {
  organizationId: number
  userId: number
  leadId: number
  planId: number
} {
  const { organizationId, userId } = seedOrgWithSession()
  const plan = getDrizzle()
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(eq(membershipPlans.name, 'Monthly'))
    .get()!
  const lead = createLead({
    fullName: 'Cancel Test Customer',
    phone: '9876543210',
    sourceId: 1
  })
  return { organizationId, userId, leadId: lead.leadId, planId: plan.id }
}

const saleDates = { startDate: '2026-08-25', endDate: '2026-11-22' }

function saleInput(leadId: number, planId: number, transactionId: string): SellMembershipInput {
  return {
    leadId,
    planId,
    offerId: null,
    joiningDate: '2026-08-25',
    ...saleDates,
    issueDate: '2026-08-25',
    basePriceMinor: 150_000,
    discountType: 'NONE' as const,
    discountValueMinor: null,
    paidAmountMinor: 50_000,
    paymentMethod: 'UPI' as const,
    transactionId
  }
}

describe('cancelMembership', () => {
  it('sets cancellation fields on ACTIVE membership with IMMEDIATE timing', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-001'))

    const result = cancelMembership({
      membershipId: sale.membershipId,
      timing: 'IMMEDIATE',
      reasonCode: 'COST',
      reasonDetail: 'Too expensive',
      refund: { mode: 'NONE' }
    })

    expect(result.membershipId).toBe(sale.membershipId)

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.status).toBe('CANCELLED')
    expect(membership.cancellation_reason_code).toBe('COST')
    expect(membership.cancellation_requested_at).toBeTruthy()
    expect(membership.cancellation_effective_date).toBe('2026-09-08')

    const events = db
      .select()
      .from(membershipEvents)
      .where(eq(membershipEvents.membership_id, sale.membershipId))
      .all()

    expect(events.some((e) => e.type === 'CANCELLED')).toBe(true)
  })

  it('sets END_OF_PERIOD timing preserves ACTIVE status until endDate', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-002'))

    cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'RELOCATION',
      reasonDetail: 'Moving to another city',
      refund: { mode: 'NONE' }
    })

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.status).toBe('ACTIVE')
    expect(membership.cancellation_effective_date).toBe('2026-11-22')
    expect(membership.cancellation_reason_code).toBe('RELOCATION')
  })

  it('persists the overridden notice end date for NOTICE_DAYS timing', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-004'))

    cancelMembership({
      membershipId: sale.membershipId,
      timing: 'NOTICE_DAYS',
      reasonCode: 'SERVICE',
      reasonDetail: 'Requested early exit',
      noticeEndDate: '2026-10-01',
      refund: { mode: 'NONE' }
    })

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.status).toBe('ACTIVE')
    expect(membership.cancellation_effective_date).toBe('2026-10-01')
  })

  it('caps the notice end date at the membership end date', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership({
      ...saleInput(leadId, planId, 'cancel-005'),
      endDate: '2026-09-25'
    })

    cancelMembership({
      membershipId: sale.membershipId,
      timing: 'NOTICE_DAYS',
      reasonCode: 'UNUSED',
      noticeEndDate: '2026-12-31',
      refund: { mode: 'NONE' }
    })

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.cancellation_effective_date).toBe('2026-09-25')
  })

  it('rejects a notice end date on or before today', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-006'))

    expect(() =>
      cancelMembership({
        membershipId: sale.membershipId,
        timing: 'NOTICE_DAYS',
        reasonCode: 'COST',
        noticeEndDate: '2026-09-08',
        refund: { mode: 'NONE' }
      })
    ).toThrow(/after today/)

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.cancellation_effective_date).toBeNull()
  })

  it('allows reason-only cancel on EXPIRED membership with non-IMMEDIATE timing', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership({
      ...saleInput(leadId, planId, 'cancel-003'),
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    })

    const result = cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'UNUSED',
      reasonDetail: 'No longer using',
      refund: { mode: 'NONE' }
    })

    expect(result.membershipId).toBe(sale.membershipId)

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    // R2.1: EXPIRED reason-only — stored status remains ACTIVE (derive-at-read),
    // but cancellation reason code is persisted
    expect(membership.cancellation_reason_code).toBe('UNUSED')
  })

  it('schedules the refund to the effective date by default for END_OF_PERIOD', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-007'))

    const result = cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'COST',
      refund: { mode: 'FULL' }
    })

    expect(result.refundIssued).toBe(false)
    expect(result.refundScheduled).toBe(true)
    expect(result.refundAmountMinor).toBe(50_000)

    const db = getDrizzle()
    const scheduled = db.select().from(refunds).where(eq(refunds.status, 'SCHEDULED')).all()
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].scheduled_date).toBe('2026-11-22')
    expect(scheduled[0].issued_at).toBeNull()

    // Money has not left — invoice status is unchanged (still PARTIALLY_PAID).
    const invoice = db.select().from(invoices).where(eq(invoices.id, sale.invoiceId)).get()!
    expect(invoice.status).toBe('PARTIALLY_PAID')
  })

  it('issues the refund immediately when refundTiming IMMEDIATE is chosen', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'cancel-008'))

    const result = cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'COST',
      refund: { mode: 'FULL', timing: 'IMMEDIATE' }
    })

    expect(result.refundIssued).toBe(true)
    expect(result.refundScheduled).toBe(false)
    expect(result.refundAmountMinor).toBe(50_000)

    const db = getDrizzle()
    const refundsRows = db.select().from(refunds).where(eq(refunds.status, 'ISSUED')).all()
    expect(refundsRows).toHaveLength(1)
    expect(refundsRows[0].scheduled_date).toBeNull()

    // Money left — invoice status re-derived (full payment refunded → OPEN).
    const invoice = db.select().from(invoices).where(eq(invoices.id, sale.invoiceId)).get()!
    expect(invoice.status).toBe('OPEN')
  })

  it('prorates NOTICE_DAYS refund against the effective date (unused days after notice)', () => {
    const { leadId, planId } = createLeadForSale()
    // Full payment so prorated is not capped by the refundable amount.
    const sale = sellMembership({
      ...saleInput(leadId, planId, 'cancel-009'),
      paidAmountMinor: 150_000
    })

    const result = cancelMembership({
      membershipId: sale.membershipId,
      timing: 'NOTICE_DAYS',
      reasonCode: 'UNUSED',
      refund: { mode: 'PRORATED' }
    })

    // Effective date = today + 14 days (2026-09-08 → 2026-09-22).
    // Used days = 2026-08-25 → 2026-09-22 (29), total 90.
    // Refund = 150000 × (90 − 29) / 90 = 101667.
    expect(result.refundAmountMinor).toBe(101_667)
    expect(result.refundScheduled).toBe(true)

    const db = getDrizzle()
    const scheduled = db.select().from(refunds).where(eq(refunds.status, 'SCHEDULED')).all()
    expect(scheduled[0].scheduled_date).toBe('2026-09-22')
  })
})

describe('revertCancellationRequest', () => {
  it('clears cancellation fields and restores status', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'revert-001'))

    cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'COST',
      reasonDetail: 'Changed mind',
      refund: { mode: 'NONE' }
    })

    revertCancellationRequest({ membershipId: sale.membershipId })

    const db = getDrizzle()
    const membership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, sale.membershipId))
      .get()!

    expect(membership.status).toBe('ACTIVE')
    expect(membership.cancellation_reason_code).toBeNull()
    expect(membership.cancellation_requested_at).toBeNull()
    expect(membership.cancellation_effective_date).toBeNull()

    const events = db
      .select()
      .from(membershipEvents)
      .where(eq(membershipEvents.membership_id, sale.membershipId))
      .all()

    expect(events.some((e) => e.type === 'CANCELLATION_REVERTED')).toBe(true)
  })

  it('voids scheduled refunds when the cancellation is reverted (kept for audit)', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'revert-002'))

    cancelMembership({
      membershipId: sale.membershipId,
      timing: 'END_OF_PERIOD',
      reasonCode: 'COST',
      refund: { mode: 'FULL' }
    })

    const db = getDrizzle()
    const before = db.select().from(refunds).where(eq(refunds.status, 'SCHEDULED')).all()
    expect(before).toHaveLength(1)

    revertCancellationRequest({ membershipId: sale.membershipId })

    const after = db.select().from(refunds).all()
    expect(after).toHaveLength(1)
    expect(after[0].status).toBe('VOIDED')
    expect(after[0].issued_at).toBeNull()
  })
})

describe('processScheduledRefunds', () => {
  it('issues due scheduled refunds and re-derives the invoice status', () => {
    const { organizationId, userId, leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'sched-001'))

    // Create a due scheduled refund directly (scheduled date in the past).
    refundRepo.create({
      organizationId,
      paymentId: sale.paymentId,
      amountMinor: 50_000,
      reason: 'Membership cancellation',
      createdBy: userId,
      status: 'SCHEDULED',
      scheduledDate: '2026-09-01',
      issuedAt: null
    })

    const result = processScheduledRefunds()
    expect(result.issued).toBe(1)

    const db = getDrizzle()
    const refundsRows = db.select().from(refunds).all()
    expect(refundsRows).toHaveLength(1)
    expect(refundsRows[0].status).toBe('ISSUED')
    expect(refundsRows[0].issued_at).toBe('2026-09-01')

    // Full payment refunded → invoice net allocated 0 → OPEN.
    const invoice = db.select().from(invoices).where(eq(invoices.id, sale.invoiceId)).get()!
    expect(invoice.status).toBe('OPEN')
  })

  it('does not issue scheduled refunds whose date has not arrived', () => {
    const { organizationId, userId, leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'sched-002'))

    refundRepo.create({
      organizationId,
      paymentId: sale.paymentId,
      amountMinor: 50_000,
      reason: 'Membership cancellation',
      createdBy: userId,
      status: 'SCHEDULED',
      scheduledDate: '2099-01-01',
      issuedAt: null
    })

    const result = processScheduledRefunds()
    expect(result.issued).toBe(0)

    const db = getDrizzle()
    expect(db.select().from(refunds).where(eq(refunds.status, 'SCHEDULED')).all()).toHaveLength(1)
  })
})

describe('renewMembership', () => {
  it('creates new membership row after old one expires', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'renew-001'))

    const result = renewMembership({
      customerId: sale.customerId,
      sourceMembershipId: sale.membershipId,
      planId,
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
      transactionId: 'renew-001-payment'
    })

    expect(result.membershipId).toBeGreaterThan(0)
    expect(result.membershipId).not.toBe(sale.membershipId)

    const db = getDrizzle()
    const newMembership = db
      .select()
      .from(memberships)
      .where(eq(memberships.id, result.membershipId))
      .get()!

    expect(newMembership.status).toBe('ACTIVE')
    expect(newMembership.start_date).toBe('2026-11-23')
    expect(newMembership.end_date).toBe('2027-02-22')

    const events = db
      .select()
      .from(membershipEvents)
      .where(eq(membershipEvents.membership_id, sale.membershipId))
      .all()

    expect(events.some((e) => e.type === 'RENEWED')).toBe(true)
  })

  it('blocks renewal when new window overlaps with active membership', () => {
    const { leadId, planId } = createLeadForSale()
    const sale = sellMembership(saleInput(leadId, planId, 'renew-002'))

    expect(() =>
      renewMembership({
        customerId: sale.customerId,
        sourceMembershipId: sale.membershipId,
        planId,
        offerId: null,
        joiningDate: '2026-10-01',
        startDate: '2026-10-01',
        endDate: '2027-01-01',
        issueDate: '2026-10-01',
        basePriceMinor: 150_000,
        discountType: 'NONE',
        discountValueMinor: null,
        paidAmountMinor: 150_000,
        paymentMethod: 'UPI',
        transactionId: 'renew-002-payment'
      })
    ).toThrow(/overlaps/i)

    const db = getDrizzle()
    expect(
      db.select().from(memberships).where(eq(memberships.customer_id, sale.customerId)).all()
    ).toHaveLength(1)
  })
})
