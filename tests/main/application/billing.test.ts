import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  createInvoice,
  addInvoiceLine,
  removeInvoiceLine,
  finalizeInvoice,
  voidInvoice,
  markUncollectible,
  getInvoice,
  listInvoicesByCustomer,
  listOpenInvoices
} from '../../../src/main/application/billing'
import { customerRepo } from '../../../src/main/repositories/membership'
import { personRepo } from '../../../src/main/repositories/sales'
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  InvoiceAlreadyFinalizedError,
  InvoiceEmptyError
} from '../../../src/main/domain/errors'

setupSalesDb()

function createTestCustomer(organizationId: number): ReturnType<typeof customerRepo.create> {
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

describe('createInvoice', () => {
  it('creates a DRAFT invoice for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    const invoice = createInvoice({ customerId: customer.id })
    expect(invoice.status).toBe('DRAFT')
    expect(invoice.customerId).toBe(customer.id)
    expect(invoice.subtotalMinor).toBe(0)
  })

  it('throws NotFoundError for non-existent customer', () => {
    seedOrgWithSession()
    expect(() => createInvoice({ customerId: 99999 })).toThrow(NotFoundError)
  })

  it('denies without invoice.create permission', () => {
    seedOrgWithSession('Front Desk')
    expect(() => createInvoice({ customerId: 1 })).toThrow(ForbiddenError)
  })
})

describe('addInvoiceLine', () => {
  it('adds a line to a DRAFT invoice and updates totals', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    const line = addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Monthly Plan',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    expect(line.description).toBe('Monthly Plan')
    expect(line.taxAmountMinor).toBe(18000)
    expect(line.lineTotalMinor).toBe(118000)

    // Verify totals updated
    const updated = getInvoice({ invoiceId: invoice.id })
    expect(updated.invoice.subtotalMinor).toBe(100000)
    expect(updated.invoice.taxMinor).toBe(18000)
    expect(updated.invoice.totalMinor).toBe(118000)
  })

  it('adds multiple lines and accumulates totals', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line 1',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line 2',
      quantity: 2,
      unitPriceMinor: 5000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    const { invoice: updated } = getInvoice({ invoiceId: invoice.id })
    expect(updated.subtotalMinor).toBe(110000) // 100000 + 10000
    expect(updated.taxMinor).toBe(19800) // 18000 + 1800
    expect(updated.totalMinor).toBe(129800) // 118000 + 11800
  })

  it('throws on non-DRAFT invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })
    finalizeInvoice({ invoiceId: invoice.id })

    expect(() =>
      addInvoiceLine({
        invoiceId: invoice.id,
        description: 'Line 2',
        quantity: 1,
        unitPriceMinor: 50000,
        discountMinor: 0,
        taxRateBps: 1800
      })
    ).toThrow(InvoiceAlreadyFinalizedError)
  })
})

describe('removeInvoiceLine', () => {
  it('removes a line and updates totals', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    const line1 = addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line 1',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line 2',
      quantity: 1,
      unitPriceMinor: 50000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    removeInvoiceLine({ invoiceId: invoice.id, lineId: line1.id })

    const { invoice: updated, lines } = getInvoice({ invoiceId: invoice.id })
    expect(lines).toHaveLength(1)
    expect(lines[0].description).toBe('Line 2')
    expect(updated.subtotalMinor).toBe(50000)
    expect(updated.taxMinor).toBe(9000)
    expect(updated.totalMinor).toBe(59000)
  })
})

describe('finalizeInvoice', () => {
  it('finalizes a DRAFT invoice and assigns a business number', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    const finalized = finalizeInvoice({ invoiceId: invoice.id })
    expect(finalized.status).toBe('OPEN')
    expect(finalized.number).toMatch(/^[A-Z0-9]{2,6}-\d{6}-\d{2}$/)
    expect(finalized.finalizedAt).toBeTruthy()
  })

  it('rejects empty invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    expect(() => finalizeInvoice({ invoiceId: invoice.id })).toThrow(InvoiceEmptyError)
  })

  it('denies without invoice.finalize permission', () => {
    seedOrgWithSession('Sales')
    expect(() => finalizeInvoice({ invoiceId: 1 })).toThrow(ForbiddenError)
  })
})

describe('voidInvoice', () => {
  it('voids an OPEN invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })
    finalizeInvoice({ invoiceId: invoice.id })

    const voided = voidInvoice({ invoiceId: invoice.id, reason: 'Customer cancelled' })
    expect(voided.status).toBe('VOID')
    expect(voided.voidReason).toBe('Customer cancelled')
  })

  it('throws on DRAFT invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })

    expect(() => voidInvoice({ invoiceId: invoice.id, reason: 'Test' })).toThrow(ValidationError)
  })
})

describe('markUncollectible', () => {
  it('marks an OPEN invoice as uncollectible', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })
    finalizeInvoice({ invoiceId: invoice.id })

    const result = markUncollectible({ invoiceId: invoice.id, reason: 'Customer left' })
    expect(result.status).toBe('UNCOLLECTIBLE')
  })
})

describe('getInvoice', () => {
  it('returns invoice with lines', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)
    const invoice = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: invoice.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })

    const result = getInvoice({ invoiceId: invoice.id })
    expect(result.invoice.id).toBe(invoice.id)
    expect(result.lines).toHaveLength(1)
  })
})

describe('listInvoicesByCustomer', () => {
  it('lists invoices for a customer', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    createInvoice({ customerId: customer.id })
    createInvoice({ customerId: customer.id })

    const invoices = listInvoicesByCustomer({ customerId: customer.id })
    expect(invoices).toHaveLength(2)
  })
})

describe('listOpenInvoices', () => {
  it('lists only open invoices', () => {
    const { organizationId } = seedOrgWithSession()
    const customer = createTestCustomer(organizationId)

    createInvoice({ customerId: customer.id })
    const open = createInvoice({ customerId: customer.id })
    addInvoiceLine({
      invoiceId: open.id,
      description: 'Line',
      quantity: 1,
      unitPriceMinor: 100000,
      discountMinor: 0,
      taxRateBps: 1800
    })
    finalizeInvoice({ invoiceId: open.id })

    const result = listOpenInvoices()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(open.id)
  })
})
