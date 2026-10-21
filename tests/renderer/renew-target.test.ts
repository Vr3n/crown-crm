import { describe, expect, it } from 'vitest'
import { expirationToRenewTarget, paymentToRenewTarget } from '@/features/dashboard/components/renew-target'
import type { MembershipExpiration, PaymentDue } from '@/features/dashboard/types'

const EXPIRATION: MembershipExpiration = {
  id: '7',
  member: { id: '3', name: 'Neha Kapoor' },
  plan: 'Monthly',
  purchasedAt: '2026-08-25',
  expiresAt: '2026-09-23',
  customerId: '3',
  planId: '2',
  joiningDate: '2026-08-25'
}

const DUE: PaymentDue = {
  id: '11',
  member: { id: '3', name: 'Neha Kapoor' },
  plan: 'Monthly',
  purchasedAt: '2026-08-25',
  amountDueMinor: 127000,
  totalMinor: 177000,
  invoiceNumber: 'ETG-250826-01',
  planStartDate: '2026-08-25',
  planEndDate: '2026-09-23',
  joiningDate: '2026-08-25',
  membershipAmountMinor: 177000,
  membershipPurchasedAt: '2026-08-25',
  customerId: '3',
  membershipId: '7',
  renewPlanId: '2'
}

describe('expirationToRenewTarget', () => {
  it('maps the expiration row to dialog input', () => {
    const target = expirationToRenewTarget(EXPIRATION)
    expect(target.id).toBe('7')
    expect(target.customerId).toBe('3')
    expect(target.planId).toBe('2')
    expect(target.joiningDate).toBe('2026-08-25')
    expect(target.startDate).toBe('2026-08-25')
    expect(target.endDate).toBe('2026-09-23')
  })
})

describe('paymentToRenewTarget', () => {
  it('maps a resolved dues row to dialog input', () => {
    const target = paymentToRenewTarget(DUE)!
    expect(target.id).toBe('7')
    expect(target.customerId).toBe('3')
    expect(target.planId).toBe('2')
    expect(target.startDate).toBe('2026-08-25')
    expect(target.endDate).toBe('2026-09-23')
  })

  it('returns null when no membership resolved (button hides)', () => {
    expect(paymentToRenewTarget({ ...DUE, membershipId: null })).toBeNull()
  })

  it('leaves planId undefined when only the membership resolved', () => {
    const target = paymentToRenewTarget({ ...DUE, renewPlanId: null })!
    expect(target.id).toBe('7')
    expect(target.planId).toBeUndefined()
  })
})
