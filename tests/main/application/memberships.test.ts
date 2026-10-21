import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { createLead } from '../../../src/main/application/leads'
import { sellMembership } from '../../../src/main/application/memberships'
import { getDrizzle } from '../../../src/main/db/connection'
import { invoices, memberships, payments, idempotencyKeys, membershipPlans } from '../../../src/main/db/schema'
import { OverpaymentNotAllowedError, ValidationError } from '../../../src/main/domain/errors'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'

setupSalesDb()

function createLeadForSale(): { organizationId: number; leadId: number } {
  const { organizationId } = seedOrgWithSession()
  const lead = createLead({
    fullName: 'Sale Customer',
    phone: '9876543210',
    sourceId: 1
  })
  return { organizationId, leadId: lead.leadId }
}

const saleDates = { startDate: '2026-08-25', endDate: '2026-11-22' }

function saleInput(leadId: number, transactionId: string): SellMembershipInput {
  const monthlyPlan = getDrizzle()
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(eq(membershipPlans.name, 'Monthly'))
    .get()!
  return {
    leadId,
    planId: monthlyPlan.id,
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

describe('sellMembership', () => {
  it('atomically creates customer, membership, finalized invoice, payment and conversion', () => {
    const { organizationId, leadId } = createLeadForSale()
    const result = sellMembership(saleInput(leadId, '00000000-0000-4000-8000-000000000001'))
    const db = getDrizzle()

    expect(result.membershipId).toBeGreaterThan(0)
    expect(result.customerId).toBeGreaterThan(0)
    expect(result.invoiceNumber).toMatch(/^[A-Z0-9]+-\d{6}-01$/)
    expect(
      db.select().from(memberships).where(eq(memberships.id, result.membershipId)).get()
    ).toBeTruthy()
    expect(db.select().from(invoices).where(eq(invoices.id, result.invoiceId)).get()?.status).toBe(
      'PARTIALLY_PAID'
    )
    expect(
      db
        .select()
        .from(invoices)
        .where(eq(invoices.id, result.invoiceId))
        .get()?.membership_id
    ).toBe(result.membershipId)
    expect(
      db.select().from(payments).where(eq(payments.id, result.paymentId)).get()?.payment_method
    ).toBe('UPI')
    expect(
      db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.organization_id, organizationId))
        .all()
    ).toHaveLength(1)
  })

  it('returns the original result for a repeated transaction id', () => {
    const { leadId } = createLeadForSale()
    const input = saleInput(leadId, '00000000-0000-4000-8000-000000000002')
    const first = sellMembership(input)
    const second = sellMembership(input)
    const db = getDrizzle()

    expect(second).toEqual(first)
    expect(db.select().from(memberships).all()).toHaveLength(1)
    expect(db.select().from(invoices).all()).toHaveLength(1)
  })

  it('rejects overpayment before committing any sale rows', () => {
    const { leadId } = createLeadForSale()
    expect(() =>
      sellMembership({
        ...saleInput(leadId, '00000000-0000-4000-8000-000000000003'),
        paidAmountMinor: 150_001
      })
    ).toThrow(OverpaymentNotAllowedError)

    const db = getDrizzle()
    expect(db.select().from(memberships).all()).toHaveLength(0)
    expect(db.select().from(invoices).all()).toHaveLength(0)
  })

  it('stores the payment reference for a cheque sale', () => {
    const { leadId } = createLeadForSale()
    const result = sellMembership({
      ...saleInput(leadId, '00000000-0000-4000-8000-000000000005'),
      paymentMethod: 'CHEQUE' as const,
      reference: 'CHQ-0042'
    })
    const db = getDrizzle()

    expect(
      db.select().from(payments).where(eq(payments.id, result.paymentId)).get()?.reference
    ).toBe('CHQ-0042')
  })

  it('keeps reference null when the payment method is not cheque', () => {
    const { leadId } = createLeadForSale()
    const result = sellMembership(saleInput(leadId, '00000000-0000-4000-8000-000000000006'))
    const db = getDrizzle()

    expect(
      db.select().from(payments).where(eq(payments.id, result.paymentId)).get()?.reference
    ).toBeNull()
  })

  it('rejects dates shorter than the selected plan duration', () => {
    const { leadId } = createLeadForSale()
    expect(() =>
      sellMembership({
        ...saleInput(leadId, '00000000-0000-4000-8000-000000000004'),
        endDate: '2026-09-01'
      })
    ).toThrow(ValidationError)
  })
})
