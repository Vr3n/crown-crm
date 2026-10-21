import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  recordPayment,
  allocatePayment,
  recordAndAllocatePayment,
  issueRefund,
  issueCredit,
  applyCredit,
  getInvoicePaymentState,
  getPaymentHistory,
  getCreditBalance,
  listCredits,
  listPaymentMethods,
  getOutstandingInvoices
} from '../../../src/main/application/finance'
import {
  createInvoice,
  addInvoiceLine,
  finalizeInvoice
} from '../../../src/main/application/billing'
import { customerRepo } from '../../../src/main/repositories/membership'
import { personRepo } from '../../../src/main/repositories/sales'
import {
  ForbiddenError,
  ValidationError,
  RefundExceedsPaymentError,
  CreditExceedsBalanceError,
  PaymentOverAllocatedError
} from '../../../src/main/domain/errors'

setupSalesDb()

function createTestCustomer(
  organizationId: number,
  phone?: string
): ReturnType<typeof customerRepo.create> {
  const person = personRepo.create({
    organizationId,
    fullName: 'Test Customer',
    phone: phone ?? '9876543210',
    email: phone ? `${phone}@test.com` : 'test@test.com'
  })
  return customerRepo.create({
    organizationId,
    personId: person.id,
    billingName: 'Test Customer',
    billingPhone: phone ?? '9876543210',
    billingEmail: phone ? `${phone}@test.com` : 'test@test.com',
    billingAddress: null,
    emergencyContact: null,
    notes: null
  })
}

function createOpenInvoice(
  organizationId: number,
  totalMinor = 118000
): {
  customer: ReturnType<typeof customerRepo.create>
  invoice: ReturnType<typeof finalizeInvoice>
} {
  const customer = createTestCustomer(organizationId)
  const invoice = createInvoice({ customerId: customer.id })
  addInvoiceLine({
    invoiceId: invoice.id,
    description: 'Monthly Plan',
    quantity: 1,
    unitPriceMinor: totalMinor - 18000,
    discountMinor: 0,
    taxRateBps: 1800
  })
  const finalized = finalizeInvoice({ invoiceId: invoice.id })
  return { customer, invoice: finalized }
}

describe('recordPayment', () => {
  it('records a payment for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: 'UPI-123',
      notes: 'Test'
    })

    expect(payment.id).toBeGreaterThan(0)
    expect(payment.amountMinor).toBe(100000)
    expect(payment.paymentMethod).toBe('UPI')
  })

  it('rejects zero amount', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    expect(() =>
      recordPayment({
        customerId: customer.id,
        paymentDate: '2026-08-21',
        amountMinor: 0,
        paymentMethod: 'UPI'
      })
    ).toThrow(ValidationError)
  })

  it('denies without payment.record permission', () => {
    seedOrgWithSession('Front Desk')
    expect(() =>
      recordPayment({
        customerId: 1,
        paymentDate: '2026-08-21',
        amountMinor: 100000,
        paymentMethod: 'UPI'
      })
    ).toThrow(ForbiddenError)
  })
})

describe('allocatePayment', () => {
  it('allocates a payment to an invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'CASH'
    })

    const result = allocatePayment({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 100000
    })

    expect(result.allocation.amountMinor).toBe(100000)
    expect(result.invoiceStatus).toBe('PARTIALLY_PAID')
    expect(result.unallocatedRemainder).toBe(0)
  })

  it('handles overpayment by capping at outstanding', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 200000,
      paymentMethod: 'CASH'
    })

    expect(() =>
      allocatePayment({
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountMinor: 200000
      })
    ).toThrow(PaymentOverAllocatedError)
  })

  it('rejects allocation to DRAFT invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'CASH'
    })

    expect(() =>
      allocatePayment({
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountMinor: 100000
      })
    ).toThrow(ValidationError)
  })
})

describe('recordAndAllocatePayment', () => {
  it('records and allocates in one transaction', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const result = recordAndAllocatePayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 118000,
      paymentMethod: 'UPI',
      invoiceId: invoice.id
    })

    expect(result.payment.amountMinor).toBe(118000)
    expect(result.allocation.amountMinor).toBe(118000)
    expect(result.invoiceStatus).toBe('PAID')
    expect(result.unallocatedRemainder).toBe(0)
  })

  it('rejects if invoice belongs to different customer', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoice } = createOpenInvoice(organizationId)
    const otherCustomer = createTestCustomer(organizationId, '9876543299')

    expect(() =>
      recordAndAllocatePayment({
        customerId: otherCustomer.id,
        paymentDate: '2026-08-21',
        amountMinor: 118000,
        paymentMethod: 'UPI',
        invoiceId: invoice.id
      })
    ).toThrow(ValidationError)
  })
})

describe('issueRefund', () => {
  it('issues a refund against a payment', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 118000,
      paymentMethod: 'UPI'
    })
    allocatePayment({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 118000
    })

    const refund = issueRefund({
      paymentId: payment.id,
      amountMinor: 20000,
      reason: 'Partial refund'
    })

    expect(refund.amountMinor).toBe(20000)
    expect(refund.reason).toBe('Partial refund')
  })

  it('rejects refund exceeding payment amount', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'CASH'
    })

    expect(() =>
      issueRefund({
        paymentId: payment.id,
        amountMinor: 100000,
        reason: 'Too much'
      })
    ).toThrow(RefundExceedsPaymentError)
  })
})

describe('issueCredit', () => {
  it('issues credit to a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const credit = issueCredit({
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill',
      expiresAt: '2026-12-31'
    })

    expect(credit.amountMinor).toBe(50000)
    expect(credit.remainingMinor).toBe(50000)
    expect(credit.reason).toBe('Goodwill')
  })

  it('rejects zero amount', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    expect(() =>
      issueCredit({
        customerId: customer.id,
        amountMinor: 0,
        reason: 'Test'
      })
    ).toThrow(ValidationError)
  })
})

describe('applyCredit', () => {
  it('applies credit to an invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const credit = issueCredit({
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill'
    })

    const result = applyCredit({
      creditId: credit.id,
      invoiceId: invoice.id,
      amountMinor: 50000
    })

    expect(result.allocation.amountMinor).toBe(50000)
    expect(result.creditRemaining).toBe(0)
    expect(result.invoiceStatus).toBe('PARTIALLY_PAID')
  })

  it('sets invoice to PAID when credit fully covers outstanding', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const credit = issueCredit({
      customerId: customer.id,
      amountMinor: 118000,
      reason: 'Full coverage'
    })

    const result = applyCredit({
      creditId: credit.id,
      invoiceId: invoice.id,
      amountMinor: 118000
    })

    expect(result.allocation.amountMinor).toBe(118000)
    expect(result.creditRemaining).toBe(0)
    expect(result.invoiceStatus).toBe('PAID')
  })

  it('sets invoice to PAID when credit plus payment fully covers outstanding', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    // First allocate a partial payment
    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'CASH'
    })
    allocatePayment({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 50000
    })

    // Then apply credit for the remaining
    const credit = issueCredit({
      customerId: customer.id,
      amountMinor: 68000,
      reason: 'Cover remaining'
    })

    const result = applyCredit({
      creditId: credit.id,
      invoiceId: invoice.id,
      amountMinor: 68000
    })

    expect(result.invoiceStatus).toBe('PAID')

    // Verify via getInvoicePaymentState
    const state = getInvoicePaymentState({ invoiceId: invoice.id })
    expect(state.outstandingMinor).toBe(0)
    expect(state.status).toBe('PAID')
  })

  it('rejects credit application exceeding remaining balance', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const credit = issueCredit({
      customerId: customer.id,
      amountMinor: 20000,
      reason: 'Goodwill'
    })

    expect(() =>
      applyCredit({
        creditId: credit.id,
        invoiceId: invoice.id,
        amountMinor: 50000
      })
    ).toThrow(CreditExceedsBalanceError)
  })
})

describe('getInvoicePaymentState', () => {
  it('returns payment state for an invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoice } = createOpenInvoice(organizationId)

    const state = getInvoicePaymentState({ invoiceId: invoice.id })
    expect(state.totalMinor).toBe(118000)
    expect(state.outstandingMinor).toBe(118000)
    expect(state.status).toBe('OPEN')
  })

  it('updates state after payment', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'CASH'
    })
    allocatePayment({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 50000
    })

    const state = getInvoicePaymentState({ invoiceId: invoice.id })
    expect(state.allocatedMinor).toBe(50000)
    expect(state.outstandingMinor).toBe(68000)
    expect(state.status).toBe('PARTIALLY_PAID')
  })
})

describe('getPaymentHistory', () => {
  it('returns payment history for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-20',
      amountMinor: 50000,
      paymentMethod: 'CASH'
    })
    recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 30000,
      paymentMethod: 'UPI'
    })

    const history = getPaymentHistory({ customerId: customer.id })
    expect(history).toHaveLength(2)
  })
})

describe('getCreditBalance', () => {
  it('returns total credit balance', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    issueCredit({ customerId: customer.id, amountMinor: 50000, reason: 'A' })
    issueCredit({ customerId: customer.id, amountMinor: 30000, reason: 'B' })

    const balance = getCreditBalance({ customerId: customer.id })
    expect(balance).toBe(80000)
  })
})

describe('listCredits', () => {
  it('lists credits for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    issueCredit({ customerId: customer.id, amountMinor: 50000, reason: 'A' })
    issueCredit({ customerId: customer.id, amountMinor: 30000, reason: 'B' })

    const credits = listCredits({ customerId: customer.id })
    expect(credits).toHaveLength(2)
  })
})

describe('listPaymentMethods', () => {
  it('returns seeded payment methods', () => {
    seedOrgWithSession()
    const methods = listPaymentMethods()
    expect(methods).toHaveLength(4)
    expect(methods.map((m) => m.name)).toEqual(['UPI', 'CASH', 'CREDIT CARD', 'DEBIT CARD'])
  })
})

describe('getOutstandingInvoices', () => {
  it('returns OPEN invoices for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const { customer, invoice } = createOpenInvoice(organizationId)

    const result = getOutstandingInvoices({ customerId: customer.id })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(String(invoice.id))
    expect(result[0].invoiceNo).toBeTruthy()
    expect(result[0].customerName).toBe('Test Customer')
    expect(result[0].totalMinor).toBe(118000)
    expect(result[0].paidMinor).toBe(0)
    expect(result[0].status).toBe('OPEN')
  })

  it('calculates paid amount from allocations', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Monthly Plan',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 0
    })
    const finalized = finalizeInvoice({ invoiceId: invoice.id })

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'CASH',
      reference: null,
      notes: null
    })
    allocatePayment({ paymentId: payment.id, invoiceId: finalized.id, amountMinor: 50000 })

    const result = getOutstandingInvoices({ customerId: customer.id })

    expect(result).toHaveLength(1)
    expect(result[0].totalMinor).toBe(100000)
    expect(result[0].paidMinor).toBe(50000)
    expect(result[0].status).toBe('PARTIALLY_PAID')
  })

  it('excludes fully PAID invoices', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Plan',
      quantity: 1,
      unitPriceMinor: 50000,
      discountMinor: 0,
      taxRateBps: 0
    })
    const finalized = finalizeInvoice({ invoiceId: invoice.id })

    const payment = recordPayment({
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'CASH',
      reference: null,
      notes: null
    })
    allocatePayment({ paymentId: payment.id, invoiceId: finalized.id, amountMinor: 50000 })

    const result = getOutstandingInvoices({ customerId: customer.id })
    expect(result).toHaveLength(0)
  })

  it('excludes DRAFT invoices', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    createInvoice({ customerId: customer.id })

    const result = getOutstandingInvoices({ customerId: customer.id })
    expect(result).toHaveLength(0)
  })

  it('returns empty array for customer with no invoices', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const result = getOutstandingInvoices({ customerId: customer.id })
    expect(result).toHaveLength(0)
  })

  it('returns multiple outstanding invoices sorted by created_at', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const inv1 = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: inv1.id,
      description: 'Plan A',
      quantity: 1,
      unitPriceMinor: 50000,
      discountMinor: 0,
      taxRateBps: 0
    })
    finalizeInvoice({ invoiceId: inv1.id })

    const inv2 = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: inv2.id,
      description: 'Plan B',
      quantity: 1,
      unitPriceMinor: 80000,
      discountMinor: 0,
      taxRateBps: 0
    })
    finalizeInvoice({ invoiceId: inv2.id })

    const result = getOutstandingInvoices({ customerId: customer.id })

    expect(result).toHaveLength(2)
    expect(result[0].line).toBe('Plan A')
    expect(result[1].line).toBe('Plan B')
  })
})
