import { and, asc, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { invoices, invoiceLines, invoiceSequence } from '../db/schema'
import type { Invoice, InvoiceLine, InvoiceSequence, InvoiceStatus } from '../domain/billing'

/**
 * Module 04 repositories. Object-literal repo (matching identity.ts/sales.ts),
 * org-scoped on every query, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary.
 */

/* -------------------------------------------------------------------------- */
/* Invoices                                                                    */
/* -------------------------------------------------------------------------- */

interface InvoiceRow {
  id: number
  organization_id: number
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
  finalized_by: number | null
  voided_at: string | null
  voided_by: number | null
  void_reason: string | null
  created_at: string
  created_by: number
}

function mapInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    organizationId: row.organization_id,
    number: row.number,
    customerId: row.customer_id,
    status: row.status as InvoiceStatus,
    billingName: row.billing_name,
    billingPhone: row.billing_phone,
    billingEmail: row.billing_email,
    billingAddress: row.billing_address,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    totalMinor: row.total_minor,
    finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const invoiceRepo = {
  getById(organizationId: number, id: number): Invoice | null {
    const row = getDrizzle()
      .select()
      .from(invoices)
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, id)))
      .get() as InvoiceRow | undefined
    return row ? mapInvoice(row) : null
  },

  getByNumber(organizationId: number, number: string): Invoice | null {
    const row = getDrizzle()
      .select()
      .from(invoices)
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.number, number)))
      .get() as InvoiceRow | undefined
    return row ? mapInvoice(row) : null
  },

  getByCustomer(organizationId: number, customerId: number): Invoice[] {
    const rows = getDrizzle()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.organization_id, organizationId), eq(invoices.customer_id, customerId))
      )
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]
    return rows.map(mapInvoice)
  },

  /** Invoices billing a specific membership (set at sale/renew via membership_id). */
  getByMembership(organizationId: number, membershipId: number): Invoice[] {
    const rows = getDrizzle()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.organization_id, organizationId), eq(invoices.membership_id, membershipId))
      )
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]
    return rows.map(mapInvoice)
  },

  listOpen(organizationId: number): Invoice[] {
    const rows = getDrizzle()
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.organization_id, organizationId),
          sql`${invoices.status} IN ('OPEN', 'PARTIALLY_PAID')`
        )
      )
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]
    return rows.map(mapInvoice)
  },

  create(input: {
    organizationId: number
    number: string
    customerId: number
    status: InvoiceStatus
    billingName: string | null
    billingPhone: string | null
    billingEmail: string | null
    billingAddress: string | null
    subtotalMinor: number
    taxMinor: number
    totalMinor: number
    createdBy: number
  }): Invoice {
    const row = getDrizzle()
      .insert(invoices)
      .values({
        organization_id: input.organizationId,
        number: input.number,
        customer_id: input.customerId,
        status: input.status,
        billing_name: input.billingName,
        billing_phone: input.billingPhone,
        billing_email: input.billingEmail,
        billing_address: input.billingAddress,
        subtotal_minor: input.subtotalMinor,
        tax_minor: input.taxMinor,
        total_minor: input.totalMinor,
        created_by: input.createdBy
      })
      .returning()
      .get() as InvoiceRow
    return mapInvoice(row)
  },

  updateStatus(
    organizationId: number,
    id: number,
    status: InvoiceStatus,
    extra?: {
      finalizedAt?: string
      finalizedBy?: number
      voidedAt?: string
      voidedBy?: number
      voidReason?: string
    }
  ): void {
    const updates: Record<string, unknown> = { status }
    if (extra?.finalizedAt) updates.finalized_at = extra.finalizedAt
    if (extra?.finalizedBy) updates.finalized_by = extra.finalizedBy
    if (extra?.voidedAt) updates.voided_at = extra.voidedAt
    if (extra?.voidedBy) updates.voided_by = extra.voidedBy
    if (extra?.voidReason !== undefined) updates.void_reason = extra.voidReason

    getDrizzle()
      .update(invoices)
      .set(updates)
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, id)))
      .run()
  },

  updateTotals(
    organizationId: number,
    id: number,
    totals: { subtotalMinor: number; taxMinor: number; totalMinor: number }
  ): void {
    getDrizzle()
      .update(invoices)
      .set({
        subtotal_minor: totals.subtotalMinor,
        tax_minor: totals.taxMinor,
        total_minor: totals.totalMinor
      })
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, id)))
      .run()
  },

  /**
   * Persists the business number assigned at finalization (#110). Called only
   * inside the finalize transaction, alongside updateStatus — a finalized
   * invoice must never commit with its DRAFT number.
   */
  updateNumber(organizationId: number, id: number, number: string): void {
    getDrizzle()
      .update(invoices)
      .set({ number })
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, id)))
      .run()
  },

  /** DRAFT-only billing snapshot edit; the caller enforces the status guard. */
  updateBillingSnapshot(
    organizationId: number,
    id: number,
    snapshot: {
      billingName: string
      billingPhone: string | null
      billingEmail: string | null
      billingAddress: string | null
    }
  ): void {
    getDrizzle()
      .update(invoices)
      .set({
        billing_name: snapshot.billingName,
        billing_phone: snapshot.billingPhone,
        billing_email: snapshot.billingEmail,
        billing_address: snapshot.billingAddress
      })
      .where(and(eq(invoices.organization_id, organizationId), eq(invoices.id, id)))
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Invoice Lines                                                               */
/* -------------------------------------------------------------------------- */

interface InvoiceLineRow {
  id: number
  organization_id: number
  invoice_id: number
  description: string
  quantity: number
  unit_price_minor: number
  discount_minor: number
  tax_rate_bps: number
  tax_amount_minor: number
  line_total_minor: number
  plan_id: number | null
  offer_id: number | null
  sort_order: number
}

function mapLine(row: InvoiceLineRow): InvoiceLine {
  return {
    id: row.id,
    organizationId: row.organization_id,
    invoiceId: row.invoice_id,
    description: row.description,
    quantity: row.quantity,
    unitPriceMinor: row.unit_price_minor,
    discountMinor: row.discount_minor,
    taxRateBps: row.tax_rate_bps,
    taxAmountMinor: row.tax_amount_minor,
    lineTotalMinor: row.line_total_minor,
    planId: row.plan_id,
    offerId: row.offer_id,
    sortOrder: row.sort_order
  }
}

export const invoiceLineRepo = {
  listByInvoice(organizationId: number, invoiceId: number): InvoiceLine[] {
    const rows = getDrizzle()
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          eq(invoiceLines.invoice_id, invoiceId)
        )
      )
      .orderBy(asc(invoiceLines.sort_order))
      .all() as InvoiceLineRow[]
    return rows.map(mapLine)
  },

  createMany(
    organizationId: number,
    lines: Array<{
      invoiceId: number
      description: string
      quantity: number
      unitPriceMinor: number
      discountMinor: number
      taxRateBps: number
      taxAmountMinor: number
      lineTotalMinor: number
      planId: number | null
      offerId: number | null
      sortOrder: number
    }>
  ): InvoiceLine[] {
    const results: InvoiceLine[] = []
    for (const line of lines) {
      const row = getDrizzle()
        .insert(invoiceLines)
        .values({
          organization_id: organizationId,
          invoice_id: line.invoiceId,
          description: line.description,
          quantity: line.quantity,
          unit_price_minor: line.unitPriceMinor,
          discount_minor: line.discountMinor,
          tax_rate_bps: line.taxRateBps,
          tax_amount_minor: line.taxAmountMinor,
          line_total_minor: line.lineTotalMinor,
          plan_id: line.planId,
          offer_id: line.offerId,
          sort_order: line.sortOrder
        })
        .returning()
        .get() as InvoiceLineRow
      results.push(mapLine(row))
    }
    return results
  },

  deleteByInvoice(organizationId: number, invoiceId: number): void {
    getDrizzle()
      .delete(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          eq(invoiceLines.invoice_id, invoiceId)
        )
      )
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Invoice Sequence                                                            */
/* -------------------------------------------------------------------------- */

interface SequenceRow {
  id: number
  organization_id: number
  year: string
  prefix: string
  last_value: number
}

function mapSequence(row: SequenceRow): InvoiceSequence {
  return {
    id: row.id,
    organizationId: row.organization_id,
    year: row.year,
    prefix: row.prefix,
    lastValue: row.last_value
  }
}

export const invoiceSequenceRepo = {
  getOrCreate(organizationId: number, year: string, prefix: string): InvoiceSequence {
    // Try to find existing
    const existing = getDrizzle()
      .select()
      .from(invoiceSequence)
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, year),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .get() as SequenceRow | undefined

    if (existing) return mapSequence(existing)

    // Create new sequence
    const row = getDrizzle()
      .insert(invoiceSequence)
      .values({
        organization_id: organizationId,
        year,
        prefix,
        last_value: 0
      })
      .returning()
      .get() as SequenceRow
    return mapSequence(row)
  },

  /**
   * Atomically increments the sequence counter and returns the new value.
   * This MUST be called inside the same transaction as invoice finalization.
   */
  incrementAndGet(organizationId: number, year: string, prefix: string): number {
    getDrizzle()
      .update(invoiceSequence)
      .set({
        last_value: sql`${invoiceSequence.last_value} + 1`
      })
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, year),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .run()

    const row = getDrizzle()
      .select({ last_value: invoiceSequence.last_value })
      .from(invoiceSequence)
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, year),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .get() as { last_value: number }

    return row.last_value
  },

  /**
   * Display-only peek at the next value WITHOUT incrementing (Module 04 §36 —
   * a preview never reserves). Creates the counter row if absent, like
   * finalize would.
   */
  peekNext(organizationId: number, year: string, prefix: string): number {
    return invoiceSequenceRepo.getOrCreate(organizationId, year, prefix).lastValue + 1
  }
}
