import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import {
  organizationRepo,
  userRepo,
  roleRepo,
  staffRepo
} from '../../../src/main/repositories/identity'
import { personRepo } from '../../../src/main/repositories/sales'
import { customerRepo } from '../../../src/main/repositories/membership'
import { invoiceRepo } from '../../../src/main/repositories/billing'
import {
  paymentRepo,
  paymentMethodRepo,
  allocationRepo,
  refundRepo,
  creditRepo,
  creditAllocationRepo
} from '../../../src/main/repositories/finance'
import {
  seedRolesForOrganization,
  seedPaymentMethodsForOrganization
} from '../../../src/main/db/seed'

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
  seedPaymentMethodsForOrganization(org.id)
  const role = roleRepo.findByName(org.id, 'Owner')!
  const user = userRepo.create({
    fullName: 'Test User',
    email: 'test@fitgym.com',
    passwordHash: 'hash'
  })
  staffRepo.create({ organizationId: org.id, userId: user.id, roleId: role.id })
  return { org, user }
}

function createCustomer(organizationId: number): ReturnType<typeof customerRepo.create> {
  const person = personRepo.create({
    organizationId,
    fullName: 'Test Customer',
    phone: '9876543210',
    email: 'test@test.com'
  })
  return customerRepo.create({
    organizationId,
    personId: person.id,
    billingName: 'Test Customer',
    billingPhone: '9876543210',
    billingEmail: 'test@test.com',
    billingAddress: null,
    emergencyContact: null,
    notes: null
  })
}

describe('paymentMethodRepo', () => {
  it('lists seeded payment methods', () => {
    const { org } = createOrgAndUser()
    const methods = paymentMethodRepo.listActive(org.id)
    expect(methods).toHaveLength(4)
    expect(methods.map((m) => m.name)).toEqual(['UPI', 'CASH', 'CREDIT CARD', 'DEBIT CARD'])
  })

  it('finds payment method by name case-insensitively', () => {
    const { org } = createOrgAndUser()
    const found = paymentMethodRepo.findByName(org.id, 'upi')
    expect(found).not.toBeNull()
    expect(found?.name).toBe('UPI')
    expect(paymentMethodRepo.findByName(org.id, 'NONEXISTENT')).toBeNull()
  })
})

describe('paymentRepo', () => {
  it('creates and reads a payment', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const payment = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: 'UPI-123',
      notes: 'Test payment',
      createdBy: user.id
    })

    expect(payment.id).toBeGreaterThan(0)
    expect(payment).toMatchObject({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: 'UPI-123'
    })

    const found = paymentRepo.getById(org.id, payment.id)
    expect(found).toEqual(payment)
  })

  it('lists payments by customer', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-20',
      amountMinor: 50000,
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      createdBy: user.id
    })
    paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 50000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })

    const payments = paymentRepo.getByCustomer(org.id, customer.id)
    expect(payments).toHaveLength(2)
  })
})

describe('allocationRepo', () => {
  it('creates and lists allocations', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'OPEN',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 100000,
      taxMinor: 18000,
      totalMinor: 118000,
      createdBy: user.id
    })

    const payment = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })

    const allocation = allocationRepo.create({
      organizationId: org.id,
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 50000,
      createdBy: user.id
    })

    expect(allocation.id).toBeGreaterThan(0)
    expect(allocation).toMatchObject({
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountMinor: 50000
    })

    const byPayment = allocationRepo.listByPayment(org.id, payment.id)
    expect(byPayment).toHaveLength(1)

    const byInvoice = allocationRepo.listByInvoice(org.id, invoice.id)
    expect(byInvoice).toHaveLength(1)
  })
})

describe('refundRepo', () => {
  it('creates and lists refunds', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const payment = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })

    const refund = refundRepo.create({
      organizationId: org.id,
      paymentId: payment.id,
      amountMinor: 20000,
      reason: 'Overpayment',
      createdBy: user.id
    })

    expect(refund.id).toBeGreaterThan(0)
    expect(refund).toMatchObject({
      paymentId: payment.id,
      amountMinor: 20000,
      reason: 'Overpayment'
    })

    const refunds = refundRepo.getByPayment(org.id, payment.id)
    expect(refunds).toHaveLength(1)
  })

  it('fetches a refund by id', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const payment = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 100000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })
    const refund = refundRepo.create({
      organizationId: org.id,
      paymentId: payment.id,
      amountMinor: 20000,
      reason: 'Overpayment',
      createdBy: user.id
    })

    const found = refundRepo.getById(org.id, refund.id)
    expect(found).not.toBeNull()
    expect(found?.amountMinor).toBe(20000)

    expect(refundRepo.getById(org.id, 99999)).toBeNull()
  })

  it('lists refunds for an invoice across its allocated payments', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'OPEN',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 100000,
      taxMinor: 18000,
      totalMinor: 118000,
      createdBy: user.id
    })

    const paymentA = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-21',
      amountMinor: 60000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })
    const paymentB = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-22',
      amountMinor: 40000,
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      createdBy: user.id
    })
    allocationRepo.create({
      organizationId: org.id,
      paymentId: paymentA.id,
      invoiceId: invoice.id,
      amountMinor: 60000,
      createdBy: user.id
    })
    allocationRepo.create({
      organizationId: org.id,
      paymentId: paymentB.id,
      invoiceId: invoice.id,
      amountMinor: 40000,
      createdBy: user.id
    })

    const refundA = refundRepo.create({
      organizationId: org.id,
      paymentId: paymentA.id,
      amountMinor: 10000,
      reason: 'Partial refund A',
      createdBy: user.id
    })
    const refundB = refundRepo.create({
      organizationId: org.id,
      paymentId: paymentB.id,
      amountMinor: 5000,
      reason: 'Partial refund B',
      createdBy: user.id
    })

    // Unrelated refund on a payment NOT allocated to the invoice must be excluded.
    const paymentC = paymentRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      paymentDate: '2026-08-23',
      amountMinor: 50000,
      paymentMethod: 'UPI',
      reference: null,
      notes: null,
      createdBy: user.id
    })
    refundRepo.create({
      organizationId: org.id,
      paymentId: paymentC.id,
      amountMinor: 50000,
      reason: 'Unrelated',
      createdBy: user.id
    })

    const refunds = refundRepo.listByInvoice(org.id, invoice.id)
    expect(refunds.map((r) => r.id)).toEqual([refundA.id, refundB.id])
    expect(refunds.reduce((sum, r) => sum + r.amountMinor, 0)).toBe(15000)
  })
})

describe('creditRepo', () => {
  it('creates and reads a credit', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const credit = creditRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill',
      expiresAt: '2026-12-31',
      createdBy: user.id
    })

    expect(credit.id).toBeGreaterThan(0)
    expect(credit).toMatchObject({
      customerId: customer.id,
      amountMinor: 50000,
      remainingMinor: 50000,
      reason: 'Goodwill'
    })

    const found = creditRepo.getById(org.id, credit.id)
    expect(found).toEqual(credit)
  })

  it('calculates credit balance', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    creditRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill',
      expiresAt: null,
      createdBy: user.id
    })
    creditRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 30000,
      reason: 'Refund credit',
      expiresAt: null,
      createdBy: user.id
    })

    const balance = creditRepo.getBalance(org.id, customer.id)
    expect(balance).toBe(80000)
  })

  it('decrements remaining balance', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const credit = creditRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill',
      expiresAt: null,
      createdBy: user.id
    })

    creditRepo.decrementRemaining(org.id, credit.id, 20000)

    const updated = creditRepo.getById(org.id, credit.id)
    expect(updated?.remainingMinor).toBe(30000)
  })
})

describe('creditAllocationRepo', () => {
  it('creates and lists credit allocations', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const credit = creditRepo.create({
      organizationId: org.id,
      customerId: customer.id,
      amountMinor: 50000,
      reason: 'Goodwill',
      expiresAt: null,
      createdBy: user.id
    })

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'OPEN',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 100000,
      taxMinor: 18000,
      totalMinor: 118000,
      createdBy: user.id
    })

    const allocation = creditAllocationRepo.create({
      organizationId: org.id,
      creditId: credit.id,
      invoiceId: invoice.id,
      amountMinor: 20000,
      createdBy: user.id
    })

    expect(allocation.id).toBeGreaterThan(0)
    expect(allocation).toMatchObject({
      creditId: credit.id,
      invoiceId: invoice.id,
      amountMinor: 20000
    })

    const byCredit = creditAllocationRepo.listByCredit(org.id, credit.id)
    expect(byCredit).toHaveLength(1)

    const byInvoice = creditAllocationRepo.listByInvoice(org.id, invoice.id)
    expect(byInvoice).toHaveLength(1)
  })
})
