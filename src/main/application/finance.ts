import { withTransaction, getDrizzle } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { customerRepo } from '../repositories/membership'
import { invoiceRepo } from '../repositories/billing'
import {
  paymentRepo,
  paymentMethodRepo,
  allocationRepo,
  refundRepo,
  creditRepo,
  creditAllocationRepo
} from '../repositories/finance'
import { PaymentAllocationService } from '../domain/finance'
import type { Refund } from '../domain/finance'
import { NotFoundError, ValidationError } from '../domain/errors'
import { assertCustomerAllowed, assertPersonAllowed } from './blacklist'
import { PERMISSIONS } from '../db/permissions'
import { asc, eq, and, inArray, sql } from 'drizzle-orm'
import {
  invoices,
  paymentAllocations,
  creditAllocations,
  invoiceLines,
  customers,
  people,
  payments
} from '../db/schema'

/**
 * Module 05 (Finance) application use cases. Each Command gates on a permission,
 * derives the org/user from the session, and owns one `withTransaction` boundary.
 */

function mapPaymentToRow(
  payment: ReturnType<typeof paymentRepo.getById> extends infer T ? NonNullable<T> : never
): {
  id: number
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  createdAt: string
} {
  return {
    id: payment.id,
    customerId: payment.customerId,
    paymentDate: payment.paymentDate,
    amountMinor: payment.amountMinor,
    paymentMethod: payment.paymentMethod,
    reference: payment.reference,
    notes: payment.notes,
    createdAt: payment.createdAt
  }
}

function mapRefundToRow(refund: Refund): {
  id: number
  paymentId: number
  amountMinor: number
  reason: string
  createdAt: string
} {
  return {
    id: refund.id,
    paymentId: refund.paymentId,
    amountMinor: refund.amountMinor,
    reason: refund.reason,
    createdAt: refund.createdAt
  }
}

function mapCreditToRow(
  credit: ReturnType<typeof creditRepo.getById> extends infer T ? NonNullable<T> : never
): {
  id: number
  customerId: number
  amountMinor: number
  remainingMinor: number
  reason: string
  expiresAt: string | null
  createdAt: string
} {
  return {
    id: credit.id,
    customerId: credit.customerId,
    amountMinor: credit.amountMinor,
    remainingMinor: credit.remainingMinor,
    reason: credit.reason,
    expiresAt: credit.expiresAt,
    createdAt: credit.createdAt
  }
}

/** Collects all refunds across all payments allocated to an invoice. */
function collectRefundsForInvoice(
  organizationId: number,
  invoiceId: number
): Array<{ amountMinor: number }> {
  const allocations = allocationRepo.listByInvoice(organizationId, invoiceId)
  const allRefunds: Array<{ amountMinor: number }> = []
  for (const alloc of allocations) {
    const paymentRefunds = refundRepo.getByPayment(organizationId, alloc.paymentId)
    allRefunds.push(...paymentRefunds)
  }
  return allRefunds
}

/** Collects all credit allocations for an invoice. */
function collectCreditsForInvoice(
  organizationId: number,
  invoiceId: number
): Array<{ amountMinor: number }> {
  return creditAllocationRepo.listByInvoice(organizationId, invoiceId)
}

/**
 * Issues every SCHEDULED refund whose scheduled date has arrived.
 * Runs at app startup (all orgs) and when the Refunds page opens. Does not
 * require a session. Scheduled refunds are recorded as ISSUED on their
 * scheduled date, then the affected invoices' status is re-derived.
 */
export function processScheduledRefunds(): { issued: number } {
  const today = new Date().toISOString().slice(0, 10)
  const due = refundRepo.listScheduledDueAll(today)
  let issued = 0

  for (const refund of due) {
    const { organizationId } = refund
    refundRepo.markIssued(organizationId, refund.id, refund.scheduledDate ?? today)
    issued++

    // Re-derive status for every invoice this refund's payment is allocated to.
    const allocations = allocationRepo.listByPayment(organizationId, refund.paymentId)
    const affectedInvoiceIds = [...new Set(allocations.map((a) => a.invoiceId))]
    for (const invoiceId of affectedInvoiceIds) {
      const invoice = invoiceRepo.getById(organizationId, invoiceId)
      if (!invoice || invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') continue
      const invoiceAllocations = allocationRepo.listByInvoice(organizationId, invoiceId)
      const invoiceRefunds = collectRefundsForInvoice(organizationId, invoiceId)
      const invoiceCredits = collectCreditsForInvoice(organizationId, invoiceId)
      const netAllocated = PaymentAllocationService.calculateNetAllocated(
        invoiceAllocations,
        invoiceRefunds,
        invoiceCredits
      )
      const newStatus = PaymentAllocationService.deriveInvoiceStatus(
        netAllocated,
        invoice.totalMinor
      )
      invoiceRepo.updateStatus(organizationId, invoiceId, newStatus)
    }
  }

  return { issued }
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

/** Records a payment from a customer. */
export function recordPayment(input: {
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference?: string | null
  notes?: string | null
}): {
  id: number
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  createdAt: string
} {
  requirePermission(PERMISSIONS.PAYMENT_RECORD)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')
  assertPersonAllowed(organizationId, customer.personId, 'record a payment')

  if (input.amountMinor <= 0) throw new ValidationError('Payment amount must be positive')

  const payment = paymentRepo.create({
    organizationId,
    customerId: input.customerId,
    paymentDate: input.paymentDate,
    amountMinor: input.amountMinor,
    paymentMethod: input.paymentMethod,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    createdBy: userId
  })

  return mapPaymentToRow(payment)
}

/** Allocates a payment (or part of it) to an invoice. */
export function allocatePayment(input: {
  paymentId: number
  invoiceId: number
  amountMinor: number
}): {
  allocation: {
    id: number
    paymentId: number
    invoiceId: number
    amountMinor: number
    createdAt: string
  }
  unallocatedRemainder: number
  invoiceStatus: string
} {
  requirePermission(PERMISSIONS.PAYMENT_ALLOCATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const payment = paymentRepo.getById(organizationId, input.paymentId)
    if (!payment) throw new NotFoundError('Payment not found')

    assertCustomerAllowed(organizationId, payment.customerId, 'allocate a payment')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'PAID') {
      throw new ValidationError(`Cannot allocate to invoice in ${invoice.status} status`)
    }

    // Check existing allocations for this payment
    const existingAllocations = allocationRepo.listByPayment(organizationId, input.paymentId)

    // Calculate invoice outstanding
    const invoiceAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const invoiceRefunds = collectRefundsForInvoice(organizationId, input.invoiceId)
    const invoiceCredits = collectCreditsForInvoice(organizationId, input.invoiceId)
    const netAllocated = PaymentAllocationService.calculateNetAllocated(
      invoiceAllocations,
      invoiceRefunds,
      invoiceCredits
    )
    const outstanding = PaymentAllocationService.calculateOutstanding(
      invoice.totalMinor,
      netAllocated
    )

    // Validate allocation
    PaymentAllocationService.validateAllocation(
      payment.amountMinor,
      existingAllocations,
      input.amountMinor,
      outstanding
    )

    // Handle overpayment: cap at outstanding
    const { allocatedToInvoice, unallocatedRemainder } = PaymentAllocationService.handleOverpayment(
      input.amountMinor,
      input.amountMinor,
      outstanding
    )

    // Create allocation
    const allocation = allocationRepo.create({
      organizationId,
      paymentId: input.paymentId,
      invoiceId: input.invoiceId,
      amountMinor: allocatedToInvoice,
      createdBy: userId
    })

    // Re-derive invoice status
    const newAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const newRefunds = collectRefundsForInvoice(organizationId, input.invoiceId)
    const newCredits = collectCreditsForInvoice(organizationId, input.invoiceId)
    const newNetAllocated = PaymentAllocationService.calculateNetAllocated(
      newAllocations,
      newRefunds,
      newCredits
    )
    const newStatus = PaymentAllocationService.deriveInvoiceStatus(
      newNetAllocated,
      invoice.totalMinor
    )

    invoiceRepo.updateStatus(organizationId, input.invoiceId, newStatus)

    return {
      allocation: {
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      unallocatedRemainder,
      invoiceStatus: newStatus
    }
  })
}

/**
 * Records a payment and allocates it to an invoice in one transaction.
 * This is the convenience command for the common "customer pays now" case
 * (Module 07 §46).
 */
export function recordAndAllocatePayment(input: {
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  invoiceId: number
  reference?: string | null
  notes?: string | null
}): {
  payment: {
    id: number
    customerId: number
    paymentDate: string
    amountMinor: number
    paymentMethod: string
    reference: string | null
    notes: string | null
    createdAt: string
  }
  allocation: {
    id: number
    paymentId: number
    invoiceId: number
    amountMinor: number
    createdAt: string
  }
  unallocatedRemainder: number
  invoiceStatus: string
} {
  requirePermission(PERMISSIONS.PAYMENT_RECORD)
  requirePermission(PERMISSIONS.PAYMENT_ALLOCATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const customer = customerRepo.getById(organizationId, input.customerId)
    if (!customer) throw new NotFoundError('Customer not found')
    assertPersonAllowed(organizationId, customer.personId, 'record a payment')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.customerId !== input.customerId) {
      throw new ValidationError('Invoice does not belong to this customer')
    }

    // Create payment
    const payment = paymentRepo.create({
      organizationId,
      customerId: input.customerId,
      paymentDate: input.paymentDate,
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      createdBy: userId
    })

    // Calculate outstanding
    const invoiceAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const invoiceRefunds = collectRefundsForInvoice(organizationId, input.invoiceId)
    const invoiceCredits = collectCreditsForInvoice(organizationId, input.invoiceId)
    const netAllocated = PaymentAllocationService.calculateNetAllocated(
      invoiceAllocations,
      invoiceRefunds,
      invoiceCredits
    )
    const outstanding = PaymentAllocationService.calculateOutstanding(
      invoice.totalMinor,
      netAllocated
    )

    // Validate and handle overpayment
    const existingAllocations = allocationRepo.listByPayment(organizationId, payment.id)
    PaymentAllocationService.validateAllocation(
      payment.amountMinor,
      existingAllocations,
      input.amountMinor,
      outstanding
    )

    const { allocatedToInvoice, unallocatedRemainder } = PaymentAllocationService.handleOverpayment(
      input.amountMinor,
      input.amountMinor,
      outstanding
    )

    // Create allocation
    const allocation = allocationRepo.create({
      organizationId,
      paymentId: payment.id,
      invoiceId: input.invoiceId,
      amountMinor: allocatedToInvoice,
      createdBy: userId
    })

    // Re-derive invoice status
    const newAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const newRefunds = collectRefundsForInvoice(organizationId, input.invoiceId)
    const newCredits = collectCreditsForInvoice(organizationId, input.invoiceId)
    const newNetAllocated = PaymentAllocationService.calculateNetAllocated(
      newAllocations,
      newRefunds,
      newCredits
    )
    const newStatus = PaymentAllocationService.deriveInvoiceStatus(
      newNetAllocated,
      invoice.totalMinor
    )

    invoiceRepo.updateStatus(organizationId, input.invoiceId, newStatus)

    return {
      payment: mapPaymentToRow(payment),
      allocation: {
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      unallocatedRemainder,
      invoiceStatus: newStatus
    }
  })
}

/** Issues a refund against a payment. Re-derives invoice state. */
export function issueRefund(input: { paymentId: number; amountMinor: number; reason: string }): {
  id: number
  paymentId: number
  amountMinor: number
  reason: string
  createdAt: string
} {
  requirePermission(PERMISSIONS.REFUND_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const payment = paymentRepo.getById(organizationId, input.paymentId)
    if (!payment) throw new NotFoundError('Payment not found')

    // Calculate net paid (payments - existing refunds)
    const existingRefunds = refundRepo.getByPayment(organizationId, input.paymentId)
    const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amountMinor, 0)
    const netPaid = payment.amountMinor - totalRefunded

    // Validate refund
    PaymentAllocationService.validateRefund(netPaid, input.amountMinor)

    // Create refund
    const refund = refundRepo.create({
      organizationId,
      paymentId: input.paymentId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      createdBy: userId
    })

    // Re-derive status for all invoices allocated to by this payment
    const allocations = allocationRepo.listByPayment(organizationId, input.paymentId)
    const affectedInvoiceIds = new Set(allocations.map((a) => a.invoiceId))

    for (const invoiceId of affectedInvoiceIds) {
      const invoice = invoiceRepo.getById(organizationId, invoiceId)
      if (!invoice || invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE') continue

      const invoiceAllocations = allocationRepo.listByInvoice(organizationId, invoiceId)
      const invoiceRefunds = collectRefundsForInvoice(organizationId, invoiceId)
      const invoiceCredits = collectCreditsForInvoice(organizationId, invoiceId)
      const netAllocated = PaymentAllocationService.calculateNetAllocated(
        invoiceAllocations,
        invoiceRefunds,
        invoiceCredits
      )
      const newStatus = PaymentAllocationService.deriveInvoiceStatus(
        netAllocated,
        invoice.totalMinor
      )

      invoiceRepo.updateStatus(organizationId, invoiceId, newStatus)
    }

    return mapRefundToRow(refund)
  })
}

/** Issues a credit to a customer's account. */
export function issueCredit(input: {
  customerId: number
  amountMinor: number
  reason: string
  expiresAt?: string | null
}): {
  id: number
  customerId: number
  amountMinor: number
  remainingMinor: number
  reason: string
  expiresAt: string | null
  createdAt: string
} {
  requirePermission(PERMISSIONS.CREDIT_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')
  assertCustomerAllowed(organizationId, customer.id, 'issue a credit')

  if (input.amountMinor <= 0) throw new ValidationError('Credit amount must be positive')

  const credit = creditRepo.create({
    organizationId,
    customerId: input.customerId,
    amountMinor: input.amountMinor,
    reason: input.reason,
    expiresAt: input.expiresAt ?? null,
    createdBy: userId
  })

  return mapCreditToRow(credit)
}

/** Applies credit to an invoice. Decrements remaining and re-derives invoice state. */
export function applyCredit(input: { creditId: number; invoiceId: number; amountMinor: number }): {
  allocation: {
    id: number
    creditId: number
    invoiceId: number
    amountMinor: number
    createdAt: string
  }
  creditRemaining: number
  invoiceStatus: string
} {
  requirePermission(PERMISSIONS.CREDIT_APPLY)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const credit = creditRepo.getById(organizationId, input.creditId)
    if (!credit) throw new NotFoundError('Credit not found')
    assertCustomerAllowed(organizationId, credit.customerId, 'apply a credit')

    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID' || invoice.status === 'PAID') {
      throw new ValidationError(`Cannot apply credit to invoice in ${invoice.status} status`)
    }

    // Validate credit application
    PaymentAllocationService.validateCreditApplication(credit.remainingMinor, input.amountMinor)

    // Create credit allocation
    const allocation = creditAllocationRepo.create({
      organizationId,
      creditId: input.creditId,
      invoiceId: input.invoiceId,
      amountMinor: input.amountMinor,
      createdBy: userId
    })

    // Decrement remaining
    creditRepo.decrementRemaining(organizationId, input.creditId, input.amountMinor)

    // Re-derive invoice status
    const invoiceAllocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
    const invoiceRefunds = collectRefundsForInvoice(organizationId, input.invoiceId)
    const invoiceCredits = collectCreditsForInvoice(organizationId, input.invoiceId)
    const netAllocated = PaymentAllocationService.calculateNetAllocated(
      invoiceAllocations,
      invoiceRefunds,
      invoiceCredits
    )
    const newStatus = PaymentAllocationService.deriveInvoiceStatus(netAllocated, invoice.totalMinor)

    invoiceRepo.updateStatus(organizationId, input.invoiceId, newStatus)

    return {
      allocation: {
        id: allocation.id,
        creditId: allocation.creditId,
        invoiceId: allocation.invoiceId,
        amountMinor: allocation.amountMinor,
        createdAt: allocation.createdAt
      },
      creditRemaining: credit.remainingMinor - input.amountMinor,
      invoiceStatus: newStatus
    }
  })
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Gets the payment state of an invoice. */
export function getInvoicePaymentState(input: { invoiceId: number }): {
  invoiceId: number
  totalMinor: number
  allocatedMinor: number
  refundedMinor: number
  outstandingMinor: number
  status: string
} {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')

  const allocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)
  const refunds = collectRefundsForInvoice(organizationId, input.invoiceId)
  const credits = collectCreditsForInvoice(organizationId, input.invoiceId)

  const netAllocated = PaymentAllocationService.calculateNetAllocated(allocations, refunds, credits)
  const outstanding = PaymentAllocationService.calculateOutstanding(
    invoice.totalMinor,
    netAllocated
  )

  return {
    invoiceId: invoice.id,
    totalMinor: invoice.totalMinor,
    allocatedMinor: netAllocated,
    refundedMinor: refunds.reduce((sum, r) => sum + r.amountMinor, 0),
    outstandingMinor: outstanding,
    status: invoice.status
  }
}

/** Gets payment history for a customer. */
export function getPaymentHistory(input: { customerId: number }): Array<{
  id: number
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  createdAt: string
}> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const payments = paymentRepo.getByCustomer(organizationId, input.customerId)
  return payments.map(mapPaymentToRow)
}

/** Gets refund history for a payment. */
export function getRefundHistory(input: { paymentId: number }): Array<{
  id: number
  paymentId: number
  amountMinor: number
  reason: string
  createdAt: string
}> {
  requirePermission(PERMISSIONS.REFUND_VIEW)
  const organizationId = currentOrganizationId()

  const refunds = refundRepo.getByPayment(organizationId, input.paymentId)
  return refunds.map(mapRefundToRow)
}

/** Gets the credit balance for a customer. */
export function getCreditBalance(input: { customerId: number }): number {
  requirePermission(PERMISSIONS.CREDIT_VIEW)
  const organizationId = currentOrganizationId()

  return creditRepo.getBalance(organizationId, input.customerId)
}

/** Lists all credits for a customer. */
export function listCredits(input: { customerId: number }): Array<{
  id: number
  customerId: number
  amountMinor: number
  remainingMinor: number
  reason: string
  expiresAt: string | null
  createdAt: string
}> {
  requirePermission(PERMISSIONS.CREDIT_VIEW)
  const organizationId = currentOrganizationId()

  const credits = creditRepo.getByCustomer(organizationId, input.customerId)
  return credits.map(mapCreditToRow)
}

/** Lists active payment methods. */
export function listPaymentMethods(): Array<{
  id: number
  name: string
  sortOrder: number
  active: boolean
}> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const methods = paymentMethodRepo.listActive(organizationId)
  return methods.map((m) => ({ id: m.id, name: m.name, sortOrder: m.sortOrder, active: m.active }))
}

/**
 * Returns outstanding (OPEN / PARTIALLY_PAID) invoices for a customer,
 * with paid amounts derived from payment allocations.
 * Used by the RecordPaymentDialog to populate the allocation section.
 */
export function getOutstandingInvoices(input: { customerId: number }): Array<{
  id: string
  invoiceNo: string
  customerName: string
  customerPhone: string | undefined
  line: string
  issuedAt: string
  totalMinor: number
  paidMinor: number
  status: string
}> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  // Fetch customer → person for the name
  const customerRow = getDrizzle()
    .select()
    .from(customers)
    .where(and(eq(customers.organization_id, organizationId), eq(customers.id, input.customerId)))
    .get() as { id: number; person_id: number } | undefined

  const personRow = customerRow
    ? (getDrizzle()
        .select()
        .from(people)
        .where(
          and(eq(people.organization_id, organizationId), eq(people.id, customerRow.person_id))
        )
        .get() as { full_name: string; phone: string | null } | undefined)
    : undefined

  const customerName = personRow?.full_name ?? 'Unknown'
  const customerPhone = personRow?.phone ?? undefined

  // Fetch OPEN / PARTIALLY_PAID invoices for this customer
  const invoiceRows = getDrizzle()
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.organization_id, organizationId),
        eq(invoices.customer_id, input.customerId),
        inArray(invoices.status, ['OPEN', 'PARTIALLY_PAID'])
      )
    )
    .orderBy(asc(invoices.created_at))
    .all() as Array<{
    id: number
    number: string
    status: string
    total_minor: number
    finalized_at: string | null
    created_at: string
  }>

  if (invoiceRows.length === 0) return []

  // Batch-fetch allocations for all outstanding invoices
  const invoiceIds = invoiceRows.map((i) => i.id)
  const allocRows = getDrizzle()
    .select({
      invoice_id: paymentAllocations.invoice_id,
      amount_minor: paymentAllocations.amount_minor
    })
    .from(paymentAllocations)
    .where(
      and(
        eq(paymentAllocations.organization_id, organizationId),
        inArray(paymentAllocations.invoice_id, invoiceIds)
      )
    )
    .all() as Array<{ invoice_id: number; amount_minor: number }>

  const paidByInvoice = new Map<number, number>()
  for (const a of allocRows) {
    paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + a.amount_minor)
  }

  // Batch-fetch credit allocations for all outstanding invoices
  const creditAllocRows = getDrizzle()
    .select({
      invoice_id: creditAllocations.invoice_id,
      amount_minor: creditAllocations.amount_minor
    })
    .from(creditAllocations)
    .where(
      and(
        eq(creditAllocations.organization_id, organizationId),
        inArray(creditAllocations.invoice_id, invoiceIds)
      )
    )
    .all() as Array<{ invoice_id: number; amount_minor: number }>

  for (const c of creditAllocRows) {
    paidByInvoice.set(c.invoice_id, (paidByInvoice.get(c.invoice_id) ?? 0) + c.amount_minor)
  }

  // Batch-fetch first line description for each invoice
  const lineRows = getDrizzle()
    .select({
      invoice_id: invoiceLines.invoice_id,
      description: invoiceLines.description
    })
    .from(invoiceLines)
    .where(inArray(invoiceLines.invoice_id, invoiceIds))
    .orderBy(asc(invoiceLines.sort_order))
    .all() as Array<{ invoice_id: number; description: string }>

  const firstLineByInvoice = new Map<number, string>()
  for (const l of lineRows) {
    if (!firstLineByInvoice.has(l.invoice_id)) {
      firstLineByInvoice.set(l.invoice_id, l.description)
    }
  }

  // Map to flat read-model rows (amounts in minor units)
  return invoiceRows.map((inv) => ({
    id: String(inv.id),
    invoiceNo: inv.number,
    customerName,
    customerPhone,
    line: firstLineByInvoice.get(inv.id) ?? 'Invoice',
    issuedAt: inv.finalized_at ?? inv.created_at,
    totalMinor: inv.total_minor,
    paidMinor: paidByInvoice.get(inv.id) ?? 0,
    status: inv.status
  }))
}

/* -------------------------------------------------------------------------- */
/* Org-wide list queries (for the Payments / Refunds / Credits pages)           */
/* -------------------------------------------------------------------------- */

/** Batch-resolves person names for an array of person IDs. */
function resolvePersonNames(
  organizationId: number,
  personIds: number[]
): Map<number, { name: string; phone?: string; email?: string }> {
  if (personIds.length === 0) return new Map()
  const uniqueIds = [...new Set(personIds)]
  const rows = getDrizzle()
    .select()
    .from(people)
    .where(
      and(
        eq(people.organization_id, organizationId),
        sql`${people.id} IN (${sql.join(
          uniqueIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{ id: number; full_name: string; phone: string | null; email: string | null }>
  const map = new Map<number, { name: string; phone?: string; email?: string }>()
  for (const r of rows) {
    map.set(r.id, {
      name: r.full_name,
      phone: r.phone ?? undefined,
      email: r.email ?? undefined
    })
  }
  return map
}

/** Batch-resolves invoice numbers for an array of invoice IDs. */
function resolveInvoiceNumbers(organizationId: number, invoiceIds: number[]): Map<number, string> {
  if (invoiceIds.length === 0) return new Map()
  const uniqueIds = [...new Set(invoiceIds)]
  const rows = getDrizzle()
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.organization_id, organizationId),
        sql`${invoices.id} IN (${sql.join(
          uniqueIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{ id: number; number: string }>
  const map = new Map<number, string>()
  for (const r of rows) map.set(r.id, r.number)
  return map
}

/**
 * Returns all payments for the org, hydrated with customer names, allocations,
 * and refund references. Used by the Payments page table.
 */
export function getAllPayments(): Array<{
  id: string
  paymentNo: string
  customer: { id: string; name: string; phone: string | undefined; email: string | undefined }
  paymentDate: string
  amountMinor: number
  method: string
  reference: string | undefined
  notes: string | undefined
  createdBy: string
  allocations: Array<{ invoiceId: string; invoiceNo: string; amountMinor: number }>
  refundIds: string[]
}> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const allPayments = paymentRepo.listAll(organizationId)
  if (allPayments.length === 0) return []

  // Batch-resolve customer person IDs
  const customerIds = [...new Set(allPayments.map((p) => p.customerId))]
  const customerRows = getDrizzle()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organization_id, organizationId),
        sql`${customers.id} IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{ id: number; person_id: number }>
  const personIdByCustomer = new Map(customerRows.map((c) => [c.id, c.person_id]))
  const personIds = customerRows.map((c) => c.person_id)

  // Also resolve createdBy person IDs
  const creatorIds = allPayments.map((p) => p.createdBy)
  const allPersonIds = [...personIds, ...creatorIds]

  const personMap = resolvePersonNames(organizationId, allPersonIds)

  // Batch-fetch allocations for all payments
  const paymentIds = allPayments.map((p) => p.id)
  const allAllocations = allocationRepo.listByPayments(organizationId, paymentIds)
  const allocsByPayment = new Map<number, typeof allAllocations>()
  for (const a of allAllocations) {
    const list = allocsByPayment.get(a.paymentId) ?? []
    list.push(a)
    allocsByPayment.set(a.paymentId, list)
  }

  // Batch-fetch refunds for all payments
  const allRefunds = refundRepo.listByPayments(organizationId, paymentIds)
  const refundsByPayment = new Map<number, typeof allRefunds>()
  for (const r of allRefunds) {
    const list = refundsByPayment.get(r.paymentId) ?? []
    list.push(r)
    refundsByPayment.set(r.paymentId, list)
  }

  // Resolve invoice numbers for allocations
  const allocInvoiceIds = [...new Set(allAllocations.map((a) => a.invoiceId))]
  const invoiceNumberMap = resolveInvoiceNumbers(organizationId, allocInvoiceIds)

  return allPayments.map((p) => {
    const personId = personIdByCustomer.get(p.customerId)
    const person = personId ? personMap.get(personId) : undefined
    const creator = personMap.get(p.createdBy)
    const allocs = allocsByPayment.get(p.id) ?? []
    const refunds = refundsByPayment.get(p.id) ?? []

    return {
      id: String(p.id),
      paymentNo: `PAY-${String(p.id).padStart(4, '0')}`,
      customer: {
        id: String(p.customerId),
        name: person?.name ?? 'Unknown',
        personId: personId ? String(personId) : undefined,
        phone: person?.phone,
        email: person?.email
      },
      paymentDate: p.paymentDate,
      amountMinor: p.amountMinor,
      method: p.paymentMethod,
      reference: p.reference ?? undefined,
      notes: p.notes ?? undefined,
      createdBy: creator?.name ?? 'System',
      allocations: allocs.map((a) => ({
        invoiceId: String(a.invoiceId),
        invoiceNo: invoiceNumberMap.get(a.invoiceId) ?? '',
        amountMinor: a.amountMinor
      })),
      refundIds: refunds.map((r) => String(r.id))
    }
  })
}

/**
 * Returns all refunds for the org, hydrated with customer names and linked
 * payment info. Used by the Refunds page table.
 */
export function getAllRefunds(): Array<{
  id: string
  refundNo: string
  customer: { id: string; name: string; phone: string | undefined; email: string | undefined }
  refundDate: string
  amountMinor: number
  sourcePaymentId: string
  sourcePaymentNo: string
  method: string
  status: string
  scheduledDate: string | null
  reason: string
  createdBy: string
}> {
  requirePermission(PERMISSIONS.REFUND_VIEW)
  const organizationId = currentOrganizationId()

  const allRefunds = refundRepo.listAll(organizationId)
  if (allRefunds.length === 0) return []

  // Batch-fetch payments to get customer IDs and payment methods
  const paymentIds = [...new Set(allRefunds.map((r) => r.paymentId))]
  const paymentRows = getDrizzle()
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.organization_id, organizationId),
        sql`${payments.id} IN (${sql.join(
          paymentIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{
    id: number
    customer_id: number
    payment_method: string
  }>
  const paymentMap = new Map(paymentRows.map((p) => [p.id, p]))

  // Batch-resolve customer person IDs
  const customerIds = [...new Set(paymentRows.map((p) => p.customer_id))]
  const customerRows = getDrizzle()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organization_id, organizationId),
        sql`${customers.id} IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{ id: number; person_id: number }>
  const personIdByCustomer = new Map(customerRows.map((c) => [c.id, c.person_id]))
  const personIds = customerRows.map((c) => c.person_id)

  // Also resolve createdBy person IDs
  const creatorIds = allRefunds.map((r) => r.createdBy)
  const allPersonIds = [...personIds, ...creatorIds]
  const personMap = resolvePersonNames(organizationId, allPersonIds)

  return allRefunds.map((r) => {
    const payment = paymentMap.get(r.paymentId)
    const personId = payment ? personIdByCustomer.get(payment.customer_id) : undefined
    const person = personId ? personMap.get(personId) : undefined
    const creator = personMap.get(r.createdBy)

    return {
      id: String(r.id),
      refundNo: `REF-${String(r.id).padStart(4, '0')}`,
      customer: {
        id: String(payment?.customer_id ?? 0),
        name: person?.name ?? 'Unknown',
        personId: personId ? String(personId) : undefined,
        phone: person?.phone,
        email: person?.email
      },
      refundDate: r.issuedAt ?? r.scheduledDate ?? r.createdAt,
      amountMinor: r.amountMinor,
      sourcePaymentId: String(r.paymentId),
      sourcePaymentNo: `PAY-${String(r.paymentId).padStart(4, '0')}`,
      method: payment?.payment_method ?? 'UNKNOWN',
      status: r.status,
      scheduledDate: r.scheduledDate,
      reason: r.reason,
      createdBy: creator?.name ?? 'System'
    }
  })
}

/**
 * Returns all credits for the org, hydrated with customer names and
 * applications. Used by the Credits page table.
 */
export function getAllCredits(): Array<{
  id: string
  creditNo: string
  customer: { id: string; name: string; phone: string | undefined; email: string | undefined }
  issuedAt: string
  amountMinor: number
  reason: string
  createdBy: string
  applications: Array<{ invoiceNo: string; amountMinor: number; appliedAt: string }>
}> {
  requirePermission(PERMISSIONS.CREDIT_VIEW)
  const organizationId = currentOrganizationId()

  const allCredits = creditRepo.listAll(organizationId)
  if (allCredits.length === 0) return []

  // Batch-resolve customer person IDs
  const customerIds = [...new Set(allCredits.map((c) => c.customerId))]
  const customerRows = getDrizzle()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.organization_id, organizationId),
        sql`${customers.id} IN (${sql.join(
          customerIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    )
    .all() as Array<{ id: number; person_id: number }>
  const personIdByCustomer = new Map(customerRows.map((c) => [c.id, c.person_id]))
  const personIds = customerRows.map((c) => c.person_id)

  // Also resolve createdBy person IDs
  const creatorIds = allCredits.map((c) => c.createdBy)
  const allPersonIds = [...personIds, ...creatorIds]
  const personMap = resolvePersonNames(organizationId, allPersonIds)

  // Batch-fetch credit allocations
  const creditIds = allCredits.map((c) => c.id)
  const allCreditAllocs = creditAllocationRepo.listByCredits(organizationId, creditIds)
  const allocsByCredit = new Map<number, typeof allCreditAllocs>()
  for (const a of allCreditAllocs) {
    const list = allocsByCredit.get(a.creditId) ?? []
    list.push(a)
    allocsByCredit.set(a.creditId, list)
  }

  // Resolve invoice numbers for credit allocations
  const allocInvoiceIds = [...new Set(allCreditAllocs.map((a) => a.invoiceId))]
  const invoiceNumberMap = resolveInvoiceNumbers(organizationId, allocInvoiceIds)

  return allCredits.map((c) => {
    const personId = personIdByCustomer.get(c.customerId)
    const person = personId ? personMap.get(personId) : undefined
    const creator = personMap.get(c.createdBy)
    const allocs = allocsByCredit.get(c.id) ?? []

    return {
      id: String(c.id),
      creditNo: `CR-${String(c.id).padStart(4, '0')}`,
      customer: {
        id: String(c.customerId),
        name: person?.name ?? 'Unknown',
        personId: personId ? String(personId) : undefined,
        phone: person?.phone,
        email: person?.email
      },
      issuedAt: c.createdAt,
      amountMinor: c.amountMinor,
      reason: c.reason,
      createdBy: creator?.name ?? 'System',
      applications: allocs.map((a) => ({
        invoiceNo: invoiceNumberMap.get(a.invoiceId) ?? '',
        amountMinor: a.amountMinor,
        appliedAt: a.createdAt
      }))
    }
  })
}
