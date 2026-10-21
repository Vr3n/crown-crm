import { asc, eq, and, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  invoices,
  invoiceLines,
  paymentAllocations,
  payments,
  people,
  customers
} from '../db/schema'
import { refundRepo, paymentRepo } from '../repositories/finance'
import { currentOrganizationId } from '../auth/session'
import {
  invoiceIdRequestSchema,
  invoicesByStatusRequestSchema
} from '../../shared/contracts/invoices'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Invoices IPC handlers (Module 04 read models).
 * Returns data in the renderer's expected shape — invoices with nested
 * line items, allocations, and customer references.
 */

interface InvoiceRow {
  id: number
  number: string
  customer_id: number
  status: string
  billing_name: string | null
  billing_phone: string | null
  billing_email: string | null
  billing_address: string | null
  subtotal_minor: number
  tax_minor: number
  total_minor: number
  finalized_at: string | null
  voided_at: string | null
  created_at: string
  created_by: number
}

interface InvoiceLineRow {
  id: number
  invoice_id: number
  description: string
  quantity: number
  unit_price_minor: number
  discount_minor: number
  tax_rate_bps: number
  tax_amount_minor: number
  line_total_minor: number
}

interface AllocationRow {
  id: number
  payment_id: number
  invoice_id: number
  amount_minor: number
  created_at: string
}

interface PaymentRow {
  id: number
  payment_method: string
  reference: string | null
  created_at: string
  created_by: number
}

interface PersonRow {
  id: number
  full_name: string
  phone: string | null
  email: string | null
}

/** Refund read model surfaced on an invoice (via the source payment). */
interface InvoiceRefundOutput {
  id: string
  refundNo: string
  refundDate: string
  amountMinor: number
  method: string
  reason: string
  sourcePaymentNo: string
}

function buildInvoiceOutput(
  organizationId: number,
  invoice: InvoiceRow,
  lines: InvoiceLineRow[],
  allocations: Array<AllocationRow & { payment: PaymentRow | undefined }>,
  person: PersonRow | undefined
): Record<string, unknown> {
  const paidMinor = allocations.reduce((sum, a) => sum + a.amount_minor, 0)
  return {
    id: String(invoice.id),
    invoiceNo: invoice.number,
    customer: {
      id: String(invoice.customer_id),
      name: person?.full_name ?? invoice.billing_name ?? 'Unknown',
      personId: person ? String(person.id) : undefined,
      phone: person?.phone ?? invoice.billing_phone ?? undefined,
      email: person?.email ?? invoice.billing_email ?? undefined
    },
    issuedAt: invoice.finalized_at ?? invoice.created_at,
    dueAt: undefined,
    status: invoice.status as
      'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE',
    billingName: invoice.billing_name,
    billingPhone: invoice.billing_phone,
    billingEmail: invoice.billing_email,
    billingAddress: invoice.billing_address,
    lines: lines.map((l) => ({
      id: String(l.id),
      description: l.description,
      quantity: l.quantity,
      unitPriceMinor: l.unit_price_minor,
      discountMinor: l.discount_minor,
      taxRateBps: l.tax_rate_bps,
      taxAmountMinor: l.tax_amount_minor,
      lineTotalMinor: l.line_total_minor
    })),
    allocations: allocations.map((a) => ({
      id: String(a.id),
      amountMinor: a.amount_minor,
      method: a.payment?.payment_method ?? 'UNKNOWN',
      reference: a.payment?.reference ?? '',
      receivedAt: a.created_at,
      receivedBy: a.payment ? String(a.payment.created_by) : ''
    })),
    refunds: buildInvoiceRefunds(organizationId, invoice.id),
    createdBy: String(invoice.created_by),
    subtotalMinor: invoice.subtotal_minor,
    taxTotalMinor: invoice.tax_minor,
    totalMinor: invoice.total_minor,
    paidMinor,
    outstandingMinor: Math.max(0, invoice.total_minor - paidMinor)
  }
}

/** Refunds for an invoice = refunds on every payment allocated to it. */
function buildInvoiceRefunds(organizationId: number, invoiceId: number): InvoiceRefundOutput[] {
  return refundRepo.listByInvoice(organizationId, invoiceId).map((r) => {
    const payment = paymentRepo.getById(organizationId, r.paymentId)
    return {
      id: String(r.id),
      refundNo: `REF-${String(r.id).padStart(4, '0')}`,
      refundDate: r.issuedAt ?? r.createdAt,
      amountMinor: r.amountMinor,
      method: payment?.paymentMethod ?? 'UNKNOWN',
      reason: r.reason,
      sourcePaymentNo: `PAY-${String(r.paymentId).padStart(4, '0')}`
    }
  })
}

export function registerInvoicesIpc(): void {
  handle(IPC_CHANNELS.INVOICES_LIST, () => {
    const organizationId = currentOrganizationId()

    const invoiceRows = getDrizzle()
      .select()
      .from(invoices)
      .where(eq(invoices.organization_id, organizationId))
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]

    if (invoiceRows.length === 0) return []

    // Batch-fetch related data
    const invoiceIds = invoiceRows.map((i) => i.id)
    const inClause = sql`${invoiceIds[0]}`
    const inList =
      invoiceIds.length > 1
        ? sql`(${sql.join(
            invoiceIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        : sql`(${inClause})`

    const allLines = getDrizzle()
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          sql`${invoiceLines.invoice_id} IN ${inList}`
        )
      )
      .all() as InvoiceLineRow[]
    const linesByInvoice = new Map<number, InvoiceLineRow[]>()
    for (const l of allLines) {
      const list = linesByInvoice.get(l.invoice_id) ?? []
      list.push(l)
      linesByInvoice.set(l.invoice_id, list)
    }

    const allAllocRows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          sql`${paymentAllocations.invoice_id} IN ${inList}`
        )
      )
      .all() as AllocationRow[]

    const paymentIds = [...new Set(allAllocRows.map((a) => a.payment_id))]
    const allPayments =
      paymentIds.length > 0
        ? (getDrizzle()
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
            .all() as PaymentRow[])
        : []
    const paymentMap = new Map(allPayments.map((p) => [p.id, p]))

    const allocsByInvoice = new Map<
      number,
      Array<AllocationRow & { payment: PaymentRow | undefined }>
    >()
    for (const a of allAllocRows) {
      const list = allocsByInvoice.get(a.invoice_id) ?? []
      list.push({ ...a, payment: paymentMap.get(a.payment_id) })
      allocsByInvoice.set(a.invoice_id, list)
    }

    // Fetch people for all customers
    const customerIds = [...new Set(invoiceRows.map((i) => i.customer_id))]
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
    const personIds = customerRows.map((c) => c.person_id)
    const personRows =
      personIds.length > 0
        ? (getDrizzle()
            .select()
            .from(people)
            .where(
              and(
                eq(people.organization_id, organizationId),
                sql`${people.id} IN (${sql.join(
                  personIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
            )
            .all() as PersonRow[])
        : []
    const personMap = new Map(personRows.map((p) => [p.id, p]))
    const personByCustomer = new Map(customerRows.map((c) => [c.id, personMap.get(c.person_id)]))

    return invoiceRows.map((inv) =>
      buildInvoiceOutput(
        organizationId,
        inv,
        linesByInvoice.get(inv.id) ?? [],
        allocsByInvoice.get(inv.id) ?? [],
        personByCustomer.get(inv.customer_id)
      )
    )
  })

  handle(IPC_CHANNELS.INVOICES_GET, invoiceIdRequestSchema, (input) => {
    const organizationId = currentOrganizationId()
    const invoiceId = parseInt(input.invoiceId, 10)

    const invoice = getDrizzle()
      .select()
      .from(invoices)
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, invoiceId)))
      .get() as InvoiceRow | undefined

    if (!invoice) return undefined

    const lines = getDrizzle()
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          eq(invoiceLines.invoice_id, invoiceId)
        )
      )
      .all() as InvoiceLineRow[]

    const allocRows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          eq(paymentAllocations.invoice_id, invoiceId)
        )
      )
      .all() as AllocationRow[]

    const paymentIds = allocRows.map((a) => a.payment_id)
    const paymentList =
      paymentIds.length > 0
        ? (getDrizzle()
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
            .all() as PaymentRow[])
        : []
    const paymentMap = new Map(paymentList.map((p) => [p.id, p]))

    const customer = getDrizzle()
      .select()
      .from(customers)
      .where(
        and(eq(customers.organization_id, organizationId), eq(customers.id, invoice.customer_id))
      )
      .get() as { person_id: number } | undefined

    const person = customer
      ? (getDrizzle()
          .select()
          .from(people)
          .where(and(eq(people.organization_id, organizationId), eq(people.id, customer.person_id)))
          .get() as PersonRow | undefined)
      : undefined

    return buildInvoiceOutput(
      organizationId,
      invoice,
      lines,
      allocRows.map((a) => ({ ...a, payment: paymentMap.get(a.payment_id) })),
      person
    )
  })

  handle(IPC_CHANNELS.INVOICES_LIST_BY_STATUS, invoicesByStatusRequestSchema, (input) => {
    const organizationId = currentOrganizationId()

    const invoiceRows = input.status
      ? (getDrizzle()
          .select()
          .from(invoices)
          .where(
            and(eq(invoices.organization_id, organizationId), eq(invoices.status, input.status))
          )
          .orderBy(asc(invoices.created_at))
          .all() as InvoiceRow[])
      : (getDrizzle()
          .select()
          .from(invoices)
          .where(eq(invoices.organization_id, organizationId))
          .orderBy(asc(invoices.created_at))
          .all() as InvoiceRow[])

    if (invoiceRows.length === 0) return []

    // Reuse the list logic by fetching all related data
    const invoiceIds = invoiceRows.map((i) => i.id)
    const inList =
      invoiceIds.length > 1
        ? sql`(${sql.join(
            invoiceIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        : sql`(${sql[invoiceIds[0]]})`

    const allLines = getDrizzle()
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          sql`${invoiceLines.invoice_id} IN ${inList}`
        )
      )
      .all() as InvoiceLineRow[]
    const linesByInvoice = new Map<number, InvoiceLineRow[]>()
    for (const l of allLines) {
      const list = linesByInvoice.get(l.invoice_id) ?? []
      list.push(l)
      linesByInvoice.set(l.invoice_id, list)
    }

    const allAllocRows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          sql`${paymentAllocations.invoice_id} IN ${inList}`
        )
      )
      .all() as AllocationRow[]

    const paymentIds = [...new Set(allAllocRows.map((a) => a.payment_id))]
    const allPayments =
      paymentIds.length > 0
        ? (getDrizzle()
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
            .all() as PaymentRow[])
        : []
    const paymentMap = new Map(allPayments.map((p) => [p.id, p]))

    const allocsByInvoice = new Map<
      number,
      Array<AllocationRow & { payment: PaymentRow | undefined }>
    >()
    for (const a of allAllocRows) {
      const list = allocsByInvoice.get(a.invoice_id) ?? []
      list.push({ ...a, payment: paymentMap.get(a.payment_id) })
      allocsByInvoice.set(a.invoice_id, list)
    }

    const customerIds = [...new Set(invoiceRows.map((i) => i.customer_id))]
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
    const personIds = customerRows.map((c) => c.person_id)
    const personRows =
      personIds.length > 0
        ? (getDrizzle()
            .select()
            .from(people)
            .where(
              and(
                eq(people.organization_id, organizationId),
                sql`${people.id} IN (${sql.join(
                  personIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
            )
            .all() as PersonRow[])
        : []
    const personMap = new Map(personRows.map((p) => [p.id, p]))
    const personByCustomer = new Map(customerRows.map((c) => [c.id, personMap.get(c.person_id)]))

    return invoiceRows.map((inv) =>
      buildInvoiceOutput(
        organizationId,
        inv,
        linesByInvoice.get(inv.id) ?? [],
        allocsByInvoice.get(inv.id) ?? [],
        personByCustomer.get(inv.customer_id)
      )
    )
  })
}
