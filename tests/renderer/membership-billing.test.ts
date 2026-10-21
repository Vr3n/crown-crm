import { describe, it, expect } from 'vitest'
import { membershipBillingTotals } from '@/features/customers/membership-billing'
import type { Membership } from '@/features/customers/types'

function membership(invoices?: Membership['invoices']): Membership {
  return {
    id: '1',
    customerId: 'c1',
    plan: 'Gold',
    priceMinor: 10000,
    discountMinor: 0,
    billingFrequency: 'MONTHLY',
    registrationFeeMinor: 0,
    startDate: '2026-01-01',
    endDate: '2026-02-01',
    status: 'ACTIVE',
    freezes: [],
    createdAt: '2026-01-01',
    ...(invoices ? { invoices } : {})
  } as Membership
}

describe('membershipBillingTotals', () => {
  it('sums total/paid/outstanding across the membership invoices', () => {
    const m = membership([
      { id: 'i1', invoiceNo: 'A-1', status: 'PAID', issuedAt: '2026-01-01', totalMinor: 10000, paidMinor: 10000, outstandingMinor: 0 },
      { id: 'i2', invoiceNo: 'A-2', status: 'OPEN', issuedAt: '2026-02-01', totalMinor: 12000, paidMinor: 5000, outstandingMinor: 7000 }
    ])
    expect(membershipBillingTotals(m)).toEqual({ totalMinor: 22000, paidMinor: 15000, outstandingMinor: 7000 })
  })

  it('reports zeros when there are no linked invoices (legacy)', () => {
    expect(membershipBillingTotals(membership(undefined))).toEqual({
      totalMinor: 0,
      paidMinor: 0,
      outstandingMinor: 0
    })
  })

  it('is identity for a single fully paid invoice', () => {
    const m = membership([{ id: 'i1', invoiceNo: 'A-1', status: 'PAID', issuedAt: '2026-01-01', totalMinor: 9000, paidMinor: 9000, outstandingMinor: 0 }])
    expect(membershipBillingTotals(m)).toEqual({ totalMinor: 9000, paidMinor: 9000, outstandingMinor: 0 })
  })
})