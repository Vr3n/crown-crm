import { currentOrganizationId, requirePermission } from '../auth/session'
import { invoiceRepo, invoiceLineRepo } from '../repositories/billing'
import { allocationRepo, paymentRepo, refundRepo } from '../repositories/finance'
import { getDrizzle } from '../db/connection'
import { organizations, customers, people, users, memberships, organizationStaff, roles } from '../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { NotFoundError, ValidationError } from '../domain/errors'
import { PERMISSIONS } from '../db/permissions'
import { formatRate } from '../../shared/contracts/money'
import { renderPdf } from '../pdf/renderer'
import { readFileSync } from 'node:fs'
import { getLogoPathSync } from '../lib/photo-storage'
import { renderInvoiceDocument } from '../pdf/templates/invoice-document'
import { renderPaymentReceipt } from '../pdf/templates/payment-receipt'
import { renderRefundReceipt } from '../pdf/templates/refund-receipt'
import type {
  InvoicePrintContext,
  ReceiptPrintContext,
  RefundPrintContext,
  OrgBranding,
  PdfAllocation,
  PdfCustomer,
  PdfRefund
} from '../pdf/types'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a stored logo filename to a base64 data-URI for PDF <img> embeds.
 * Returns null when missing, legacy data-URL-shaped, or unreadable — the
 * caller prints without a logo instead of blocking the document.
 */
function resolveLogoDataUri(organizationId: number, logo: string | null): string | null {
  if (!logo || logo.startsWith('data:')) return logo ?? null
  try {
    const buffer: Buffer = readFileSync(getLogoPathSync(organizationId, logo))
    const ext = logo.split('.').pop()?.toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

function getOrgBranding(organizationId: number): OrgBranding {
  const org = getDrizzle()
    .select({
      name: organizations.name,
      legal_name: organizations.legal_name,
      logo: organizations.logo,
      address: organizations.address,
      gstin: organizations.gstin,
      mobile_number: organizations.mobile_number,
      org_invoice_prefix: organizations.org_invoice_prefix,
      timezone: organizations.timezone,
      invoice_terms: organizations.invoice_terms,
      receipt_terms: organizations.receipt_terms,
      refund_terms: organizations.refund_terms
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .get() as
    | {
        name: string
        legal_name: string | null
        logo: string | null
        address: string | null
        gstin: string | null
        mobile_number: string
        org_invoice_prefix: string | null
        timezone: string | null
        invoice_terms: string | null
        receipt_terms: string | null
        refund_terms: string | null
      }
    | undefined

  if (!org) throw new NotFoundError('Organization not found')

  return {
    name: org.name,
    legalName: org.legal_name,
    logo: resolveLogoDataUri(organizationId, org.logo),
    address: org.address,
    gstin: org.gstin,
    mobileNumber: org.mobile_number,
    invoicePrefix: org.org_invoice_prefix,
    timezone: org.timezone,
    invoiceTerms: org.invoice_terms,
    receiptTerms: org.receipt_terms,
    refundTerms: org.refund_terms
  }
}

/** Fetches customer personal info (name, phone, email) from the people table. */
function getCustomerInfo(organizationId: number, customerId: number): PdfCustomer {
  const row = getDrizzle()
    .select({
      name: people.full_name,
      phone: people.phone,
      email: people.email
    })
    .from(customers)
    .innerJoin(people, eq(customers.person_id, people.id))
    .where(and(eq(customers.organization_id, organizationId), eq(customers.id, customerId)))
    .get() as { name: string; phone: string; email: string | null } | undefined

  if (!row) throw new NotFoundError('Customer not found')

  return {
    name: row.name,
    phone: row.phone,
    email: row.email
  }
}

/**
 * Renders "now" in the Organization's timezone so the printed timestamp matches
 * the gym's business date. Falls back to Asia/Kolkata (the setup default) when
 * the org has no explicit timezone.
 */
export function formatNow(timezone?: string | null): string {
  return new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone ?? 'Asia/Kolkata'
  })
}

/**
 * Resolves a user's attribution for a print document as "Full Name (Role)".
 * The name comes from the stamped User row unconditionally, so historical
 * documents keep their attribution even after the staffer is deactivated or
 * removed; the "(Role)" suffix resolves only from an ACTIVE staff membership
 * row. Returns null only when the User row itself is missing — renderers fall
 * back to "Unknown User". Attribution always comes from the session User
 * stamped on the record, never a hardcoded name and never an inferred
 * `created_by` fallback.
 */
export function resolveAttribution(organizationId: number, userId: number): string | null {
  const user = getDrizzle()
    .select({ fullName: users.full_name })
    .from(users)
    .where(eq(users.id, userId))
    .get() as { fullName: string } | undefined
  if (!user) return null

  const staff = getDrizzle()
    .select({ roleName: roles.name })
    .from(organizationStaff)
    .leftJoin(roles, eq(roles.id, organizationStaff.role_id))
    .where(
      and(
        eq(organizationStaff.organization_id, organizationId),
        eq(organizationStaff.user_id, userId),
        eq(organizationStaff.status, 'ACTIVE')
      )
    )
    .get() as { roleName: string | null } | undefined

  return staff?.roleName ? `${user.fullName} (${staff.roleName})` : user.fullName
}

/** Builds a safe filename from customer name + ID + timestamp. */
function buildFilename(customerName: string, docId: string, timestamp: Date): string {
  const safe = customerName
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
  const ts = timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${safe}_${docId}_${ts}.pdf`
}

/* -------------------------------------------------------------------------- */
/* Invoice Document Export                                                     */
/* -------------------------------------------------------------------------- */

/** Collects refunds for an invoice = refunds on every payment allocated to it. */
function collectInvoiceRefunds(organizationId: number, invoiceId: number): PdfRefund[] {
  return refundRepo.listByInvoice(organizationId, invoiceId).map((r) => {
    const payment = paymentRepo.getById(organizationId, r.paymentId)
    return {
      refundNo: `REF-${String(r.id).padStart(4, '0')}`,
      refundDate: r.issuedAt ?? r.createdAt,
      method: payment?.paymentMethod ?? 'UNKNOWN',
      reason: r.reason,
      amount: r.amountMinor
    }
  })
}

export function exportInvoicePdf(input: {
  invoiceId: number
  mode?: 'save' | 'preview'
}): Promise<string> {
  requirePermission(PERMISSIONS.INVOICE_VIEW)
  const organizationId = currentOrganizationId()

  const invoice = invoiceRepo.getById(organizationId, input.invoiceId)
  if (!invoice) throw new NotFoundError('Invoice not found')

  const lines = invoiceLineRepo.listByInvoice(organizationId, input.invoiceId)
  const customerInfo = getCustomerInfo(organizationId, invoice.customerId)

  const allocations = allocationRepo.listByInvoice(organizationId, input.invoiceId)

  // Hydrate allocation payment numbers
  const enrichedAllocations: PdfAllocation[] = allocations.map((alloc) => {
    const payment = paymentRepo.getById(organizationId, alloc.paymentId)
    const paymentNo = payment
      ? `PAY-${String(payment.id).padStart(4, '0')}`
      : `PAY-${alloc.paymentId}`
    return {
      paymentNo,
      method: payment?.paymentMethod ?? 'UNKNOWN',
      amount: alloc.amountMinor,
      receivedAt: alloc.createdAt
    }
  })

  const org = getOrgBranding(organizationId)
  const now = formatNow(org.timezone)

  // Fetch the latest membership for this customer (for duration info)
  const membership = getDrizzle()
    .select({
      planName: memberships.plan_name_snapshot,
      joiningDate: memberships.joining_date,
      startDate: memberships.start_date,
      endDate: memberships.end_date
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.organization_id, organizationId),
        eq(memberships.customer_id, invoice.customerId)
      )
    )
    .orderBy(desc(memberships.created_at))
    .get() as
    { planName: string; joiningDate: string; startDate: string; endDate: string } | undefined

  // Calculate paid amount from allocations
  const paidAmount = allocations.reduce((sum, a) => sum + a.amountMinor, 0)
  const refunds = collectInvoiceRefunds(organizationId, input.invoiceId)
  const refundedAmount = refunds.reduce((sum, r) => sum + r.amount, 0)
  const outstanding = invoice.totalMinor - paidAmount

  // Attribution: the session User who finalized the invoice. Null for a DRAFT —
  // the template omits the Finalized By line until the invoice is finalized.
  const finalizedBy =
    invoice.finalizedBy != null
      ? resolveAttribution(organizationId, invoice.finalizedBy) ?? 'Unknown User'
      : null

  const ctx: InvoicePrintContext = {
    org,
    invoiceNo: invoice.number,
    status: invoice.status,
    // Canonical issue date (#110): business date, not the audit timestamp.
    issuedAt: invoice.finalizedAt ?? invoice.createdAt,
    dueAt: invoice.finalizedAt,
    customer: customerInfo,
    membership: membership
      ? {
          planName: membership.planName,
          joiningDate: membership.joiningDate,
          startDate: membership.startDate,
          endDate: membership.endDate
        }
      : null,
    lines: lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPriceMinor,
      taxRate: formatRate(l.taxRateBps),
      discountAmount: l.discountMinor,
      lineTotal: l.lineTotalMinor
    })),
    subtotal: invoice.subtotalMinor,
    taxTotal: invoice.taxMinor,
    total: invoice.totalMinor,
    allocations: enrichedAllocations,
    refunds,
    paidAmount,
    refundedAmount,
    outstanding,
    finalizedBy,
    generatedAt: now
  }

  const html = renderInvoiceDocument(ctx)
  const downloadTime = new Date()
  const filename = buildFilename(customerInfo.name, invoice.number, downloadTime)
  const shouldOpen = input.mode !== 'save'

  return renderPdf(html, filename, 'Invoices', shouldOpen)
}

/* -------------------------------------------------------------------------- */
/* Payment Receipt Export                                                      */
/* -------------------------------------------------------------------------- */

export function exportReceiptPdf(input: {
  paymentId: number
  mode?: 'save' | 'preview'
}): Promise<string> {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const payment = paymentRepo.getById(organizationId, input.paymentId)
  if (!payment) throw new NotFoundError('Payment not found')

  const customerInfo = getCustomerInfo(organizationId, payment.customerId)

  const allocations = allocationRepo.listByPayment(organizationId, input.paymentId)

  // Enrich allocations with invoice numbers and calculate outstanding per invoice
  let totalOutstanding = 0
  const enrichedAllocations = allocations.map((alloc) => {
    const invoice = invoiceRepo.getById(organizationId, alloc.invoiceId)
    if (invoice) {
      // Calculate this invoice's outstanding after this allocation
      const invoiceAllocations = allocationRepo.listByInvoice(organizationId, alloc.invoiceId)
      const totalPaid = invoiceAllocations.reduce((sum, a) => sum + a.amountMinor, 0)
      const invoiceOutstanding = Math.max(0, invoice.totalMinor - totalPaid)
      totalOutstanding += invoiceOutstanding
    }
    return {
      invoiceNo: invoice?.number ?? `INV-${alloc.invoiceId}`,
      amount: alloc.amountMinor
    }
  })

  // Fetch the latest membership name for this customer
  const membership = getDrizzle()
    .select({ planName: memberships.plan_name_snapshot })
    .from(memberships)
    .where(
      and(
        eq(memberships.organization_id, organizationId),
        eq(memberships.customer_id, payment.customerId)
      )
    )
    .orderBy(desc(memberships.created_at))
    .get() as { planName: string } | undefined

  const org = getOrgBranding(organizationId)
  const now = formatNow(org.timezone)

  // Attribution: the session User who recorded the payment (Full Name (Role)).
  const receivedBy = resolveAttribution(organizationId, payment.createdBy) ?? 'Unknown User'

  const paymentNo = `PAY-${String(payment.id).padStart(4, '0')}`

  const ctx: ReceiptPrintContext = {
    org,
    paymentNo,
    paymentDate: payment.paymentDate,
    amount: payment.amountMinor,
    method: payment.paymentMethod,
    reference: payment.reference,
    customer: customerInfo,
    membershipName: membership?.planName ?? null,
    allocations: enrichedAllocations,
    outstanding: totalOutstanding,
    receivedBy,
    generatedAt: now
  }

  const html = renderPaymentReceipt(ctx)
  const downloadTime = new Date()
  const filename = buildFilename(customerInfo.name, paymentNo, downloadTime)
  const shouldOpen = input.mode !== 'save'

  return renderPdf(html, filename, 'Receipts', shouldOpen)
}

/* -------------------------------------------------------------------------- */
/* Refund Receipt Export                                                       */
/* -------------------------------------------------------------------------- */

export function exportRefundPdf(input: {
  refundId: number
  mode?: 'save' | 'preview'
}): Promise<string> {
  requirePermission(PERMISSIONS.REFUND_VIEW)
  const organizationId = currentOrganizationId()

  const refund = refundRepo.getById(organizationId, input.refundId)
  if (!refund) throw new NotFoundError('Refund not found')
  if (refund.status !== 'ISSUED') {
    throw new ValidationError('Receipt is only available for issued refunds')
  }

  const payment = paymentRepo.getById(organizationId, refund.paymentId)
  if (!payment) throw new NotFoundError('Payment not found')

  const customerInfo = getCustomerInfo(organizationId, payment.customerId)

  // Invoice numbers the source payment was allocated to
  const allocations = allocationRepo.listByPayment(organizationId, refund.paymentId)
  const invoiceNumbers = allocations
    .map((alloc) => invoiceRepo.getById(organizationId, alloc.invoiceId)?.number)
    .filter((n): n is string => Boolean(n))

  // Fetch the latest membership name for this customer
  const membership = getDrizzle()
    .select({ planName: memberships.plan_name_snapshot })
    .from(memberships)
    .where(
      and(
        eq(memberships.organization_id, organizationId),
        eq(memberships.customer_id, payment.customerId)
      )
    )
    .orderBy(desc(memberships.created_at))
    .get() as { planName: string } | undefined

  const org = getOrgBranding(organizationId)
  const now = formatNow(org.timezone)

  // Attribution: the session User who recorded the refund (Full Name (Role)).
  const recordedBy = resolveAttribution(organizationId, refund.createdBy) ?? 'Unknown User'

  const refundNo = `REF-${String(refund.id).padStart(4, '0')}`
  const sourcePaymentNo = `PAY-${String(payment.id).padStart(4, '0')}`

  const ctx: RefundPrintContext = {
    org,
    refundNo,
    refundDate: refund.issuedAt ?? refund.createdAt,
    amount: refund.amountMinor,
    method: payment.paymentMethod,
    sourcePaymentNo,
    invoiceNumbers,
    customer: customerInfo,
    membershipName: membership?.planName ?? null,
    reason: refund.reason,
    recordedBy,
    generatedAt: now
  }

  const html = renderRefundReceipt(ctx)
  const downloadTime = new Date()
  const filename = buildFilename(customerInfo.name, refundNo, downloadTime)
  const shouldOpen = input.mode !== 'save'

  return renderPdf(html, filename, 'Refunds', shouldOpen)
}
