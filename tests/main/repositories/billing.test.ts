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
import {
  invoiceRepo,
  invoiceLineRepo,
  invoiceSequenceRepo
} from '../../../src/main/repositories/billing'
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

describe('invoiceRepo', () => {
  it('creates and reads an invoice', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-260821-0001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: 'Ravi Kumar',
      billingPhone: '9876543210',
      billingEmail: 'ravi@test.com',
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    expect(invoice.id).toBeGreaterThan(0)
    expect(invoice).toMatchObject({
      organizationId: org.id,
      number: 'INV-260821-0001',
      status: 'DRAFT',
      subtotalMinor: 0
    })

    const found = invoiceRepo.getById(org.id, invoice.id)
    expect(found).toEqual(invoice)
  })

  it('finds invoice by number', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-260821-0001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    const found = invoiceRepo.getByNumber(org.id, 'INV-260821-0001')
    expect(found).not.toBeNull()
    expect(invoiceRepo.getByNumber(org.id, 'INV-NONEXISTENT')).toBeNull()
  })

  it('lists invoices by customer', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })
    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-002',
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

    const invoices = invoiceRepo.getByCustomer(org.id, customer.id)
    expect(invoices).toHaveLength(2)
  })

  it('lists open invoices', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-DRAFT',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })
    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-OPEN',
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
    invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-PAID',
      customerId: customer.id,
      status: 'PAID',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 100000,
      taxMinor: 18000,
      totalMinor: 118000,
      createdBy: user.id
    })

    const openInvoices = invoiceRepo.listOpen(org.id)
    expect(openInvoices).toHaveLength(1)
    expect(openInvoices[0].status).toBe('OPEN')
  })

  it('updates invoice status', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    invoiceRepo.updateStatus(org.id, invoice.id, 'OPEN', {
      finalizedAt: new Date().toISOString(),
      finalizedBy: user.id
    })

    const updated = invoiceRepo.getById(org.id, invoice.id)
    expect(updated?.status).toBe('OPEN')
    expect(updated?.finalizedBy).toBe(user.id)
  })

  it('updates invoice totals', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    invoiceRepo.updateTotals(org.id, invoice.id, {
      subtotalMinor: 100000,
      taxMinor: 18000,
      totalMinor: 118000
    })

    const updated = invoiceRepo.getById(org.id, invoice.id)
    expect(updated?.subtotalMinor).toBe(100000)
    expect(updated?.taxMinor).toBe(18000)
    expect(updated?.totalMinor).toBe(118000)
  })
})

describe('invoiceLineRepo', () => {
  it('creates and lists lines', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    const lines = invoiceLineRepo.createMany(org.id, [
      {
        invoiceId: invoice.id,
        description: 'Monthly Plan',
        quantity: 1,
        unitPriceMinor: 100000,
        discountMinor: 0,
        taxRateBps: 1800,
        taxAmountMinor: 18000,
        lineTotalMinor: 118000,
        planId: null,
        offerId: null,
        sortOrder: 0
      },
      {
        invoiceId: invoice.id,
        description: 'Add-on',
        quantity: 2,
        unitPriceMinor: 5000,
        discountMinor: 0,
        taxRateBps: 1800,
        taxAmountMinor: 1800,
        lineTotalMinor: 11800,
        planId: null,
        offerId: null,
        sortOrder: 1
      }
    ])

    expect(lines).toHaveLength(2)
    expect(lines[0].description).toBe('Monthly Plan')
    expect(lines[1].description).toBe('Add-on')

    const stored = invoiceLineRepo.listByInvoice(org.id, invoice.id)
    expect(stored).toHaveLength(2)
  })

  it('deletes all lines for an invoice', () => {
    const { org, user } = createOrgAndUser()
    const customer = createCustomer(org.id)

    const invoice = invoiceRepo.create({
      organizationId: org.id,
      number: 'INV-001',
      customerId: customer.id,
      status: 'DRAFT',
      billingName: null,
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: user.id
    })

    invoiceLineRepo.createMany(org.id, [
      {
        invoiceId: invoice.id,
        description: 'Line 1',
        quantity: 1,
        unitPriceMinor: 100000,
        discountMinor: 0,
        taxRateBps: 1800,
        taxAmountMinor: 18000,
        lineTotalMinor: 118000,
        planId: null,
        offerId: null,
        sortOrder: 0
      }
    ])

    invoiceLineRepo.deleteByInvoice(org.id, invoice.id)
    expect(invoiceLineRepo.listByInvoice(org.id, invoice.id)).toHaveLength(0)
  })
})

describe('invoiceSequenceRepo', () => {
  it('creates and increments sequence', () => {
    const { org } = createOrgAndUser()

    const seq1 = invoiceSequenceRepo.getOrCreate(org.id, '2026', 'INV')
    expect(seq1.lastValue).toBe(0)

    const val1 = invoiceSequenceRepo.incrementAndGet(org.id, '2026', 'INV')
    expect(val1).toBe(1)

    const val2 = invoiceSequenceRepo.incrementAndGet(org.id, '2026', 'INV')
    expect(val2).toBe(2)

    // Same sequence returned on second call
    const seq2 = invoiceSequenceRepo.getOrCreate(org.id, '2026', 'INV')
    expect(seq2.lastValue).toBe(2)
  })
})
