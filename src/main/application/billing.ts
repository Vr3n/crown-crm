import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { assertCustomerAllowed, assertPersonAllowed } from './blacklist'
import { customerRepo } from '../repositories/membership'
import { invoiceRepo, invoiceLineRepo, invoiceSequenceRepo } from '../repositories/billing'
import { InvoiceCalculationService, deriveInvoicePrefix, formatDDMMYY } from '../domain/billing'
import { assertValidBusinessDate, businessDateToUtc, todayInOrgTz } from '../domain/dates'
import { orgTimezone } from './organization'
import { organizationRepo } from '../repositories/identity'
import {
  InvoiceAlreadyFinalizedError,
  InvoiceEmptyError,
  InvoiceNumberCollisionError,
  NotFoundError,
  ValidationError
} from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import type { Invoice, InvoiceLine } from '../domain/billing'
import type { Organization } from '../domain/identity'

type InvoiceOutput = Omit<Invoice, 'organizationId' | 'createdBy'>
type InvoiceLineOutput = Omit<InvoiceLine, 'organizationId'>
type OrganizationWithPrefix = Organization & { org_invoice_prefix: string | null }
import type {
  AddInvoiceLineInput,
  CreateInvoiceInput,
  CustomerInvoicesRequest,
  FinalizeInvoiceInput,
  InvoiceIdRequest,
  InvoiceNumberPreview,
  MarkUncollectibleInput,
  RemoveInvoiceLineInput,
  UpdateBillingSnapshotInput,
  VoidInvoiceInput
} from '../../shared/contracts/billing'

/**
 * Module 04 (Billing) application use cases. Each Command gates on a permission,
 * derives the org/user from the session, and owns one `withTransaction` boundary.
 */

function mapInvoiceToRow(invoice: Invoice): InvoiceOutput {
  return {
    id: invoice.id,
    number: invoice.number,
    customerId: invoice.customerId,
    status: invoice.status,
    billingName: invoice.billingName,
    billingPhone: invoice.billingPhone,
    billingEmail: invoice.billingEmail,
    billingAddress: invoice.billingAddress,
    subtotalMinor: invoice.subtotalMinor,
    taxMinor: invoice.taxMinor,
    totalMinor: invoice.totalMinor,
    finalizedAt: invoice.finalizedAt,
    finalizedBy: invoice.finalizedBy,
    voidedAt: invoice.voidedAt,
    voidedBy: invoice.voidedBy,
    voidReason: invoice.voidReason,
    createdAt: invoice.createdAt
  }
}

function mapLineToRow(line: InvoiceLine): InvoiceLineOutput {
  return {
    id: line.id,
    invoiceId: line.invoiceId,
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    discountMinor: line.discountMinor,
    taxRateBps: line.taxRateBps,
    taxAmountMinor: line.taxAmountMinor,
    lineTotalMinor: line.lineTotalMinor,
    planId: line.planId,
    offerId: line.offerId,
    sortOrder: line.sortOrder
  }
}

/** Creates a DRAFT invoice for a customer. */
export function createInvoice(input: CreateInvoiceInput): InvoiceOutput {
  requirePermission(PERMISSIONS.INVOICE_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')
  assertPersonAllowed(organizationId, customer.personId, 'create an invoice')

  // Generate a temporary number; final number assigned on finalize. The random
  // suffix keeps back-to-back creates in the same millisecond unique.
  const today = new Date().toISOString().slice(0, 10)
  const tempNumber = `DRAFT-${today}-${customer.id}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`

  const invoice = invoiceRepo.create({
    organizationId,
    number: tempNumber,
    customerId: customer.id,
    status: 'DRAFT',
    billingName: customer.billingName,
    billingPhone: customer.billingPhone,
    billingEmail: customer.billingEmail,
    billingAddress: customer.billingAddress,
    subtotalMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
    createdBy: userId
  })

  return mapInvoiceToRow(invoice)
}

/** Appends a line to a DRAFT invoice and recomputes draft totals. */
export function addInvoiceLine(input: AddInvoiceLineInput): InvoiceLineOutput {
  requirePermission(PERMISSIONS.INVOICE_CREATE)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')
  if (invoice.status !== 'DRAFT') throw new InvoiceAlreadyFinalizedError()
  assertCustomerAllowed(organizationId, invoice.customerId, 'edit an invoice')

  const { taxAmountMinor, lineTotalMinor } = InvoiceCalculationService.calculateLineTax(
    input.unitPriceMinor,
    input.quantity,
    input.taxRateBps
  )

  // Get existing lines to compute sort order
  const existingLines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const nextSortOrder = existingLines.length

  const line = invoiceLineRepo.createMany(organizationId, [
    {
      invoiceId: input.invoiceId,
      description: input.description,
      quantity: input.quantity,
      unitPriceMinor: input.unitPriceMinor,
      discountMinor: input.discountMinor,
      taxRateBps: input.taxRateBps,
      taxAmountMinor,
      lineTotalMinor,
      planId: input.planId ?? null,
      offerId: input.offerId ?? null,
      sortOrder: nextSortOrder
    }
  ])[0]

  // Recompute draft totals
  const allLines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const totals = InvoiceCalculationService.calculateDraftTotals(allLines)
  invoiceRepo.updateTotals(organizationId, input.invoiceId, totals)

  return mapLineToRow(line)
}

/** Removes a line from a DRAFT invoice and recomputes draft totals. */
export function removeInvoiceLine(input: RemoveInvoiceLineInput): void {
  requirePermission(PERMISSIONS.INVOICE_CREATE)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')
  if (invoice.status !== 'DRAFT') throw new InvoiceAlreadyFinalizedError()
  assertCustomerAllowed(organizationId, invoice.customerId, 'edit an invoice')

  const lines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const targetLine = lines.find((l) => l.id === input.lineId)
  if (!targetLine) throw new NotFoundError('Invoice line not found')

  // Remove the line and recompute
  invoiceLineRepo.deleteByInvoice(organizationId, input.invoiceId)
  const remainingLines = lines.filter((l) => l.id !== input.lineId)
  if (remainingLines.length > 0) {
    invoiceLineRepo.createMany(
      organizationId,
      remainingLines.map((l, i) => ({
        invoiceId: input.invoiceId,
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: l.unitPriceMinor,
        discountMinor: l.discountMinor,
        taxRateBps: l.taxRateBps,
        taxAmountMinor: l.taxAmountMinor,
        lineTotalMinor: l.lineTotalMinor,
        planId: l.planId,
        offerId: l.offerId,
        sortOrder: i
      }))
    )
  }

  const allLines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const totals = InvoiceCalculationService.calculateDraftTotals(allLines)
  invoiceRepo.updateTotals(organizationId, input.invoiceId, totals)
}

/** Updates the billing snapshot on a DRAFT invoice. Never touches `customers`. */
export function updateBillingSnapshot(input: UpdateBillingSnapshotInput): InvoiceOutput {
  requirePermission(PERMISSIONS.INVOICE_CREATE)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')
  if (invoice.status !== 'DRAFT') throw new InvoiceAlreadyFinalizedError()
  assertCustomerAllowed(organizationId, invoice.customerId, 'edit an invoice')

  invoiceRepo.updateBillingSnapshot(organizationId, input.invoiceId, {
    billingName: input.billingName,
    billingPhone: input.billingPhone,
    billingEmail: input.billingEmail,
    billingAddress: input.billingAddress
  })

  return mapInvoiceToRow(invoiceRepo.getById(organizationId, input.invoiceId) ?? invoice)
}

/**
 * Display-only preview of the next invoice number (Module 04 §36). Reads the
 * sequence counter without incrementing — the authoritative number is assigned
 * inside the finalize transaction, so this value is never reserved.
 * Accepts an optional issue date so the preview follows the picked billing
 * date (#110); defaults to today in the Organization timezone.
 */
export function nextInvoiceNumberPreview(input?: { issueDate?: string }): InvoiceNumberPreview {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const org = organizationRepo.findById(organizationId)
  const prefix = deriveInvoicePrefix(
    org?.name ?? 'ORG',
    (org as OrganizationWithPrefix)?.org_invoice_prefix ?? null
  )
  let dateKey: string
  if (input?.issueDate) {
    assertValidBusinessDate(input.issueDate, 'issueDate')
    dateKey = `${input.issueDate.slice(8, 10)}${input.issueDate.slice(5, 7)}${input.issueDate.slice(2, 4)}`
  } else {
    const now = new Date()
    dateKey = formatDDMMYY(now)
  }
  const nextValue = invoiceSequenceRepo.peekNext(organizationId, dateKey, prefix)
  return {
    dateKey,
    prefix,
    nextValue,
    preview: `${prefix}-${dateKey}-${String(nextValue).padStart(2, '0')}`
  }
}

/** Finalizes a DRAFT invoice: assigns the business number and freezes it. */
export function finalizeInvoice(input: FinalizeInvoiceInput): InvoiceOutput {
  requirePermission(PERMISSIONS.INVOICE_FINALIZE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  return withTransaction(() => {
    const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
    if (!invoice) throw new NotFoundError('Invoice not found')
    if (invoice.status !== 'DRAFT') throw new InvoiceAlreadyFinalizedError()
    assertCustomerAllowed(organizationId, invoice.customerId, 'finalize an invoice')

    const lines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
    if (lines.length === 0) throw new InvoiceEmptyError()

    // Business issue date (#110): explicit back/future date or today in the
    // Organization timezone. The Invoice Number follows the issue date.
    const timezone = orgTimezone(organizationId)
    const effectiveDate = input.issueDate ?? todayInOrgTz(timezone)
    assertValidBusinessDate(effectiveDate, 'issueDate')

    // Generate the real invoice number atomically.
    // dateKey is derived from the YYYY-MM-DD string (not via Date getters)
    // so no local-timezone shift can move it across a day boundary.
    const org = organizationRepo.findById(organizationId)
    const prefix = deriveInvoicePrefix(
      org?.name ?? 'ORG',
      (org as OrganizationWithPrefix)?.org_invoice_prefix ?? null
    )
    const dateKey = `${effectiveDate.slice(8, 10)}${effectiveDate.slice(5, 7)}${effectiveDate.slice(2, 4)}`

    // Ensure sequence exists and increment atomically
    invoiceSequenceRepo.getOrCreate(organizationId, dateKey, prefix)
    const seqValue = invoiceSequenceRepo.incrementAndGet(organizationId, dateKey, prefix)
    const invoiceNumber = `${prefix}-${dateKey}-${String(seqValue).padStart(2, '0')}`

    // Check for collision (extremely unlikely but defensive)
    const existing = invoiceRepo.getByNumber(organizationId, invoiceNumber)
    if (existing) throw new InvoiceNumberCollisionError()

    // Day-precision business meaning: Organization-local noon → UTC instant.
    // created_at stays the audit timestamp of when the row was typed.
    const finalizedAt = businessDateToUtc(effectiveDate, timezone)
    invoiceRepo.updateStatus(organizationId, input.invoiceId, 'OPEN', {
      finalizedAt,
      finalizedBy: userId
    })
    // Persist the business number in the SAME transaction — a finalized
    // invoice must never commit with its DRAFT number.
    invoiceRepo.updateNumber(organizationId, input.invoiceId, invoiceNumber)

    // Overwrite the temporary number with the real one (persisted above)
    invoiceRepo.updateTotals(organizationId, input.invoiceId, {
      subtotalMinor: invoice.subtotalMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor
    })

    return mapInvoiceToRow({
      ...invoice,
      number: invoiceNumber,
      status: 'OPEN',
      finalizedAt,
      finalizedBy: userId
    })
  })
}

/** Voids an OPEN invoice. Financial values are kept. */ export function voidInvoice(
  input: VoidInvoiceInput
): InvoiceOutput {
  requirePermission(PERMISSIONS.INVOICE_VOID)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')
  if (invoice.status !== 'OPEN' && invoice.status !== 'PARTIALLY_PAID') {
    throw new ValidationError('Only OPEN or PARTIALLY_PAID invoices can be voided')
  }
  assertCustomerAllowed(organizationId, invoice.customerId, 'void an invoice')

  const now = new Date().toISOString()
  invoiceRepo.updateStatus(organizationId, input.invoiceId, 'VOID', {
    voidedAt: now,
    voidedBy: userId,
    voidReason: input.reason
  })

  return mapInvoiceToRow({
    ...invoice,
    status: 'VOID',
    voidedAt: now,
    voidedBy: userId,
    voidReason: input.reason
  })
}

/** Marks an OPEN invoice as uncollectible. */
export function markUncollectible(input: MarkUncollectibleInput): InvoiceOutput {
  requirePermission(PERMISSIONS.INVOICE_VOID)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')
  if (invoice.status !== 'OPEN' && invoice.status !== 'PARTIALLY_PAID') {
    throw new ValidationError('Only OPEN or PARTIALLY_PAID invoices can be marked uncollectible')
  }
  assertCustomerAllowed(organizationId, invoice.customerId, 'mark an invoice uncollectible')

  invoiceRepo.updateStatus(organizationId, input.invoiceId, 'UNCOLLECTIBLE', {
    voidReason: input.reason
  })

  return mapInvoiceToRow({ ...invoice, status: 'UNCOLLECTIBLE', voidReason: input.reason })
}

/* -------------------------------------------------------------------------- */
/* Queries                                                                     */
/* -------------------------------------------------------------------------- */

/** Gets an invoice with its lines. */
export function getInvoice(input: InvoiceIdRequest): {
  invoice: InvoiceOutput
  lines: InvoiceLineOutput[]
} {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')

  const lines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)

  return {
    invoice: mapInvoiceToRow(invoice),
    lines: lines.map(mapLineToRow)
  }
}

/** Lists all invoices for a customer. */
export function listInvoicesByCustomer(input: CustomerInvoicesRequest): InvoiceOutput[] {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoices = invoiceRepo.getByCustomer(organizationId, input.customerId)
  return invoices.map(mapInvoiceToRow)
}

/** Lists all open (unpaid/partially paid) invoices. */
export function listOpenInvoices(): InvoiceOutput[] {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoices = invoiceRepo.listOpen(organizationId)
  return invoices.map(mapInvoiceToRow)
}
