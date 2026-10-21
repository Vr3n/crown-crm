import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { createLead } from '../../../src/main/application/leads'
import { sellMembership, renewMembership } from '../../../src/main/application/memberships'
import { getInvoice } from '../../../src/main/application/billing'
import { paymentRepo } from '../../../src/main/repositories/finance'
import { getDrizzle } from '../../../src/main/db/connection'
import { memberships, membershipPlans } from '../../../src/main/db/schema'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'

setupSalesDb()

// Frozen "today": 2026-09-08 12:00Z.
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function fixture(): { organizationId: number; leadId: number; planId: number } {
  const { organizationId } = seedOrgWithSession()
  const plan = getDrizzle()
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(eq(membershipPlans.name, 'Monthly'))
    .get()!
  const lead = createLead({ fullName: 'Issue Date Buyer', phone: '9876543210', sourceId: 1 })
  return { organizationId, leadId: lead.leadId, planId: plan.id }
}

function saleInput(leadId: number, planId: number, issueDate: string): SellMembershipInput {
  return {
    leadId,
    planId,
    offerId: null,
    joiningDate: '2026-08-10',
    startDate: '2026-08-10',
    endDate: '2026-09-08',
    issueDate,
    basePriceMinor: 150_000,
    discountType: 'NONE',
    discountValueMinor: null,
    paidAmountMinor: 50_000,
    paymentMethod: 'UPI',
    transactionId: `issue-date-${issueDate}-${Math.floor(Math.random() * 1_000_000)}`
  }
}

describe('membership sale shared billing date (#110)', () => {
  it('drives both Invoice finalized_at and Payment payment_date', () => {
    const { organizationId, leadId, planId } = fixture()
    const result = sellMembership(saleInput(leadId, planId, '2026-08-10'))

    const { invoice } = getInvoice({ invoiceId: result.invoiceId })
    expect(invoice.number).toMatch(/-100826-\d{2}$/)
    expect(invoice.finalizedAt).toBe('2026-08-10T06:30:00.000Z')

    const payment = paymentRepo.getById(organizationId, result.paymentId)!
    expect(payment.paymentDate).toBe('2026-08-10')
  })

  it('keeps created_at as the audit timestamp, not the paper date', () => {
    const { leadId, planId } = fixture()
    const result = sellMembership(saleInput(leadId, planId, '2026-08-10'))

    const { invoice } = getInvoice({ invoiceId: result.invoiceId })
    // created_at comes from the SQLite engine clock (datetime('now')), not the
    // paper date: it must differ from the back-dated issue date.
    expect(invoice.createdAt.slice(0, 10)).not.toBe('2026-08-10')
    expect(invoice.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(invoice.finalizedAt!.slice(0, 10)).toBe('2026-08-10')
  })

  it('keeps joiningDate, startDate and issueDate independent on renew', () => {
    const { organizationId, leadId, planId } = fixture()
    const sale = sellMembership(saleInput(leadId, planId, '2026-08-25'))

    const renewed = renewMembership({
      customerId: sale.customerId,
      sourceMembershipId: sale.membershipId,
      planId,
      offerId: null,
      joiningDate: '2025-01-01',
      startDate: '2026-10-01',
      endDate: '2026-10-30',
      issueDate: '2026-09-15',
      basePriceMinor: 150_000,
      discountType: 'NONE',
      discountValueMinor: null,
      paidAmountMinor: 150_000,
      paymentMethod: 'UPI',
      transactionId: `renew-triple-${Date.now()}`
    })

    const row = getDrizzle()
      .select()
      .from(memberships)
      .where(eq(memberships.id, renewed.membershipId))
      .get()!
    expect(row.joining_date).toBe('2025-01-01')
    expect(row.start_date).toBe('2026-10-01')

    const { invoice } = getInvoice({ invoiceId: renewed.invoiceId })
    expect(invoice.finalizedAt).toBe('2026-09-15T06:30:00.000Z')

    const payment = paymentRepo.getById(organizationId, renewed.paymentId)!
    expect(payment.paymentDate).toBe('2026-09-15')
  })
})
