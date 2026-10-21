import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  createInvoice,
  addInvoiceLine,
  finalizeInvoice,
  getInvoice,
  nextInvoiceNumberPreview,
  voidInvoice
} from '../../../src/main/application/billing'
import { invoiceRepo } from '../../../src/main/repositories/billing'
import { customerRepo } from '../../../src/main/repositories/membership'
import { personRepo } from '../../../src/main/repositories/sales'
import { getDrizzle } from '../../../src/main/db/connection'
import { invoiceSequence } from '../../../src/main/db/schema'
import {
  InvoiceEmptyError,
  InvoiceNumberCollisionError,
  ValidationError
} from '../../../src/main/domain/errors'

setupSalesDb()

// Freeze the clock so "today" is deterministic: 2026-09-08 12:00Z
// (17:30 IST — same UTC and IST calendar day).
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

function createCustomerWithLine(
  organizationId: number,
  phone = '9876543210'
): { customerId: number; invoiceId: number } {
  const person = personRepo.create({
    organizationId,
    fullName: 'Issue Date Customer',
    phone,
    email: null
  })
  const customer = customerRepo.create({
    organizationId,
    personId: person.id,
    billingName: person.fullName,
    billingPhone: person.phone,
    billingEmail: null,
    billingAddress: null,
    emergencyContact: null,
    notes: null
  })
  const invoice = createInvoice({ customerId: customer.id })
  addInvoiceLine({
    invoiceId: invoice.id,
    description: 'Monthly Plan',
    quantity: 1,
    unitPriceMinor: 100000,
    discountMinor: 0,
    taxRateBps: 1800
  })
  return { customerId: customer.id, invoiceId: invoice.id }
}

describe('finalizeInvoice issue date (#110)', () => {
  it('persists the business number instead of the DRAFT number', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoiceId } = createCustomerWithLine(organizationId)

    const finalized = finalizeInvoice({ invoiceId })
    expect(finalized.number.startsWith('DRAFT-')).toBe(false)

    // Read-your-write: the stored row carries the real number.
    const stored = invoiceRepo.getById(organizationId, invoiceId)!
    expect(stored.number).toBe(finalized.number)
    expect(getInvoice({ invoiceId }).invoice.number).toBe(finalized.number)
  })

  it('back-dates number, dateKey and finalized_at from issueDate', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoiceId } = createCustomerWithLine(organizationId)

    const finalized = finalizeInvoice({ invoiceId, issueDate: '2026-08-10' })
    expect(finalized.number).toMatch(/-100826-\d{2}$/)
    expect(finalized.finalizedAt).toBe('2026-08-10T06:30:00.000Z')

    const stored = invoiceRepo.getById(organizationId, invoiceId)!
    expect(stored.number).toBe(finalized.number)
    expect(stored.finalizedAt).toBe('2026-08-10T06:30:00.000Z')
  })

  it('defaults to today in the Organization timezone when absent', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoiceId } = createCustomerWithLine(organizationId)

    const finalized = finalizeInvoice({ invoiceId })
    expect(finalized.number).toMatch(/-080926-\d{2}$/)
    expect(finalized.finalizedAt).toBe('2026-09-08T06:30:00.000Z')
  })

  it('rejects impossible and malformed issue dates', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoiceId } = createCustomerWithLine(organizationId)

    expect(() => finalizeInvoice({ invoiceId, issueDate: '2026-02-30' })).toThrow(ValidationError)
    expect(() => finalizeInvoice({ invoiceId, issueDate: 'tomorrow' })).toThrow(ValidationError)
    expect(() => finalizeInvoice({ invoiceId, issueDate: '10-08-2026' })).toThrow(ValidationError)
  })

  it('rolls back number, dates and sequence on collision (no failure gaps)', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { customerId, invoiceId } = createCustomerWithLine(organizationId)

    // Squat the number this finalization would take.
    const preview = nextInvoiceNumberPreview({ issueDate: '2026-08-10' })
    invoiceRepo.create({
      organizationId,
      number: preview.preview,
      customerId,
      status: 'DRAFT',
      billingName: 'Blocker',
      billingPhone: null,
      billingEmail: null,
      billingAddress: null,
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      createdBy: userId
    })

    expect(() => finalizeInvoice({ invoiceId, issueDate: '2026-08-10' })).toThrow(
      InvoiceNumberCollisionError
    )

    // Atomic final state: DRAFT number kept, dates NULL, sequence unconsumed.
    const stored = invoiceRepo.getById(organizationId, invoiceId)!
    expect(stored.status).toBe('DRAFT')
    expect(stored.number.startsWith('DRAFT-')).toBe(true)
    expect(stored.finalizedAt).toBeNull()
    expect(stored.finalizedBy).toBeNull()
    expect(nextInvoiceNumberPreview({ issueDate: '2026-08-10' }).preview).toBe(preview.preview)
  })

  it('still rejects finalizing an empty invoice', () => {
    const { organizationId } = seedOrgWithSession()
    const person = personRepo.create({
      organizationId,
      fullName: 'Empty Invoice',
      phone: '9876543211',
      email: null
    })
    const customer = customerRepo.create({
      organizationId,
      personId: person.id,
      billingName: person.fullName,
      billingPhone: person.phone,
      billingEmail: null,
      billingAddress: null,
      emergencyContact: null,
      notes: null
    })
    const invoice = createInvoice({ customerId: customer.id })
    expect(() => finalizeInvoice({ invoiceId: invoice.id, issueDate: '2026-08-10' })).toThrow(
      InvoiceEmptyError
    )
  })

  it('never reissues a voided invoice number (cancellation retains the series)', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createCustomerWithLine(organizationId)
    const finalized = finalizeInvoice({ invoiceId: first.invoiceId, issueDate: '2026-08-10' })

    const voided = voidInvoice({ invoiceId: first.invoiceId, reason: 'Duplicate entry' })
    expect(voided.status).toBe('VOID')
    expect(invoiceRepo.getById(organizationId, first.invoiceId)!.number).toBe(finalized.number)

    const second = createCustomerWithLine(organizationId, '9876543212')
    const refinalized = finalizeInvoice({ invoiceId: second.invoiceId, issueDate: '2026-08-10' })
    expect(refinalized.number).not.toBe(finalized.number)
    expect(refinalized.number).toMatch(/-100826-0\d$/)
  })

  it('lets the sequence width grow past 99 without blocking (padStart is a minimum)', () => {
    const { organizationId } = seedOrgWithSession()
    const { invoiceId } = createCustomerWithLine(organizationId)
    const preview = nextInvoiceNumberPreview({ issueDate: '2026-08-10' })
    finalizeInvoice({ invoiceId, issueDate: '2026-08-10' })

    // Simulate a very busy day: 99 numbers already consumed.
    const db = getDrizzle()
    db.update(invoiceSequence)
      .set({ last_value: 99 })
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, '100826'),
          eq(invoiceSequence.prefix, preview.prefix)
        )
      )
      .run()

    expect(nextInvoiceNumberPreview({ issueDate: '2026-08-10' }).preview).toMatch(/-100826-100$/)
  })
})
