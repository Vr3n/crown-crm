import { and, asc, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  payments,
  paymentMethods,
  paymentAllocations,
  refunds,
  credits,
  creditAllocations
} from '../db/schema'
import type {
  Payment,
  PaymentAllocation,
  Refund,
  Credit,
  CreditAllocation,
  PaymentMethodRecord
} from '../domain/finance'

/**
 * Module 05 repositories. Object-literal repo (matching identity.ts/sales.ts),
 * org-scoped on every query, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary.
 */

/* -------------------------------------------------------------------------- */
/* Payment Methods (Reference Table)                                           */
/* -------------------------------------------------------------------------- */

interface PaymentMethodRow {
  id: number
  organization_id: number
  name: string
  sort_order: number
  active: boolean
  created_at: string
}

function mapPaymentMethod(row: PaymentMethodRow): PaymentMethodRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at
  }
}

export const paymentMethodRepo = {
  listActive(organizationId: number): PaymentMethodRecord[] {
    const rows = getDrizzle()
      .select()
      .from(paymentMethods)
      .where(
        and(eq(paymentMethods.organization_id, organizationId), eq(paymentMethods.active, true))
      )
      .orderBy(asc(paymentMethods.sort_order))
      .all() as PaymentMethodRow[]
    return rows.map(mapPaymentMethod)
  },

  findByName(organizationId: number, name: string): PaymentMethodRecord | null {
    const row = getDrizzle()
      .select()
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.organization_id, organizationId),
          sql`lower(${paymentMethods.name}) = lower(${name})`
        )
      )
      .get() as PaymentMethodRow | undefined
    return row ? mapPaymentMethod(row) : null
  }
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                    */
/* -------------------------------------------------------------------------- */

interface PaymentRow {
  id: number
  organization_id: number
  customer_id: number
  payment_date: string
  amount_minor: number
  payment_method: string
  reference: string | null
  notes: string | null
  created_at: string
  created_by: number
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    paymentDate: row.payment_date,
    amountMinor: row.amount_minor,
    paymentMethod: row.payment_method,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const paymentRepo = {
  getById(organizationId: number, id: number): Payment | null {
    const row = getDrizzle()
      .select()
      .from(payments)
      .where(and(eq(payments.organization_id, organizationId), eq(payments.id, id)))
      .get() as PaymentRow | undefined
    return row ? mapPayment(row) : null
  },

  getByCustomer(organizationId: number, customerId: number): Payment[] {
    const rows = getDrizzle()
      .select()
      .from(payments)
      .where(
        and(eq(payments.organization_id, organizationId), eq(payments.customer_id, customerId))
      )
      .orderBy(asc(payments.created_at))
      .all() as PaymentRow[]
    return rows.map(mapPayment)
  },

  listAll(organizationId: number): Payment[] {
    const rows = getDrizzle()
      .select()
      .from(payments)
      .where(eq(payments.organization_id, organizationId))
      .orderBy(asc(payments.created_at))
      .all() as PaymentRow[]
    return rows.map(mapPayment)
  },

  listByDate(organizationId: number, from: string, to: string): Payment[] {
    const rows = getDrizzle()
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.organization_id, organizationId),
          sql`${payments.payment_date} >= ${from}`,
          sql`${payments.payment_date} <= ${to}`
        )
      )
      .orderBy(asc(payments.payment_date))
      .all() as PaymentRow[]
    return rows.map(mapPayment)
  },

  create(input: {
    organizationId: number
    customerId: number
    paymentDate: string
    amountMinor: number
    paymentMethod: string
    reference: string | null
    notes: string | null
    createdBy: number
  }): Payment {
    const row = getDrizzle()
      .insert(payments)
      .values({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        payment_date: input.paymentDate,
        amount_minor: input.amountMinor,
        payment_method: input.paymentMethod,
        reference: input.reference,
        notes: input.notes,
        created_by: input.createdBy
      })
      .returning()
      .get() as PaymentRow
    return mapPayment(row)
  }
}

/* -------------------------------------------------------------------------- */
/* Payment Allocations                                                         */
/* -------------------------------------------------------------------------- */

interface AllocationRow {
  id: number
  organization_id: number
  payment_id: number
  invoice_id: number
  amount_minor: number
  created_at: string
  created_by: number
}

function mapAllocation(row: AllocationRow): PaymentAllocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    invoiceId: row.invoice_id,
    amountMinor: row.amount_minor,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const allocationRepo = {
  listByPayments(organizationId: number, paymentIds: number[]): PaymentAllocation[] {
    if (paymentIds.length === 0) return []
    const rows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          sql`${paymentAllocations.payment_id} IN (${sql.join(
            paymentIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as AllocationRow[]
    return rows.map(mapAllocation)
  },

  listByPayment(organizationId: number, paymentId: number): PaymentAllocation[] {
    const rows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          eq(paymentAllocations.payment_id, paymentId)
        )
      )
      .all() as AllocationRow[]
    return rows.map(mapAllocation)
  },

  listByInvoice(organizationId: number, invoiceId: number): PaymentAllocation[] {
    const rows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          eq(paymentAllocations.invoice_id, invoiceId)
        )
      )
      .all() as AllocationRow[]
    return rows.map(mapAllocation)
  },

  create(input: {
    organizationId: number
    paymentId: number
    invoiceId: number
    amountMinor: number
    createdBy: number
  }): PaymentAllocation {
    const row = getDrizzle()
      .insert(paymentAllocations)
      .values({
        organization_id: input.organizationId,
        payment_id: input.paymentId,
        invoice_id: input.invoiceId,
        amount_minor: input.amountMinor,
        created_by: input.createdBy
      })
      .returning()
      .get() as AllocationRow
    return mapAllocation(row)
  }
}

/* -------------------------------------------------------------------------- */
/* Refunds                                                                     */
/* -------------------------------------------------------------------------- */

interface RefundRow {
  id: number
  organization_id: number
  payment_id: number
  amount_minor: number
  reason: string
  status: string
  scheduled_date: string | null
  issued_at: string | null
  created_at: string
  created_by: number
}

function mapRefund(row: RefundRow): Refund {
  return {
    id: row.id,
    organizationId: row.organization_id,
    paymentId: row.payment_id,
    amountMinor: row.amount_minor,
    reason: row.reason,
    status: row.status as Refund['status'],
    scheduledDate: row.scheduled_date,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const refundRepo = {
  /** All refunds incl. SCHEDULED/VOIDED — used by the Refunds page list. */
  listAll(organizationId: number): Refund[] {
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(eq(refunds.organization_id, organizationId))
      .orderBy(asc(refunds.created_at))
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  /** ISSUED refunds only (money already left) — used for payment detail/refunded totals. */
  listByPayments(organizationId: number, paymentIds: number[]): Refund[] {
    if (paymentIds.length === 0) return []
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.organization_id, organizationId),
          eq(refunds.status, 'ISSUED'),
          sql`${refunds.payment_id} IN (${sql.join(
            paymentIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  /** ISSUED refunds only (money already left) — used for refundable / invoice net math. */
  getByPayment(organizationId: number, paymentId: number): Refund[] {
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.organization_id, organizationId),
          eq(refunds.payment_id, paymentId),
          eq(refunds.status, 'ISSUED')
        )
      )
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  getById(organizationId: number, id: number): Refund | null {
    const row = getDrizzle()
      .select()
      .from(refunds)
      .where(and(eq(refunds.organization_id, organizationId), eq(refunds.id, id)))
      .get() as RefundRow | undefined
    return row ? mapRefund(row) : null
  },

  /** ISSUED refunds for an invoice = refunds on every payment allocated to it. */
  listByInvoice(organizationId: number, invoiceId: number): Refund[] {
    const allocRows = getDrizzle()
      .select({ payment_id: paymentAllocations.payment_id })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          eq(paymentAllocations.invoice_id, invoiceId)
        )
      )
      .all() as Array<{ payment_id: number }>
    const paymentIds = [...new Set(allocRows.map((a) => a.payment_id))]
    if (paymentIds.length === 0) return []
    return this.listByPayments(organizationId, paymentIds)
  },

  /** SCHEDULED refunds due on or before `today` for one org. */
  listScheduledDue(organizationId: number, today: string): Refund[] {
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.organization_id, organizationId),
          eq(refunds.status, 'SCHEDULED'),
          sql`${refunds.scheduled_date} <= ${today}`
        )
      )
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  /** SCHEDULED refunds due on or before `today` across all orgs (startup sweep). */
  listScheduledDueAll(today: string): Refund[] {
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(and(eq(refunds.status, 'SCHEDULED'), sql`${refunds.scheduled_date} <= ${today}`))
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  /** SCHEDULED refunds on the given payments (org-scoped) — used by revert. */
  listScheduledByPayments(organizationId: number, paymentIds: number[]): Refund[] {
    if (paymentIds.length === 0) return []
    const rows = getDrizzle()
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.organization_id, organizationId),
          eq(refunds.status, 'SCHEDULED'),
          sql`${refunds.payment_id} IN (${sql.join(
            paymentIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as RefundRow[]
    return rows.map(mapRefund)
  },

  create(input: {
    organizationId: number
    paymentId: number
    amountMinor: number
    reason: string
    createdBy: number
    status?: Refund['status']
    scheduledDate?: string | null
    issuedAt?: string | null
  }): Refund {
    const row = getDrizzle()
      .insert(refunds)
      .values({
        organization_id: input.organizationId,
        payment_id: input.paymentId,
        amount_minor: input.amountMinor,
        reason: input.reason,
        status: input.status ?? 'ISSUED',
        scheduled_date: input.scheduledDate ?? null,
        issued_at: input.issuedAt ?? null,
        created_by: input.createdBy
      })
      .returning()
      .get() as RefundRow
    return mapRefund(row)
  },

  /** Marks a SCHEDULED refund as issued on the given date (money left). */
  markIssued(organizationId: number, id: number, issuedAt: string): void {
    getDrizzle()
      .update(refunds)
      .set({ status: 'ISSUED', issued_at: issuedAt })
      .where(and(eq(refunds.organization_id, organizationId), eq(refunds.id, id)))
      .run()
  },

  /** Soft-deletes a SCHEDULED refund (e.g. cancellation reverted) — kept for audit. */
  markVoided(organizationId: number, id: number): void {
    getDrizzle()
      .update(refunds)
      .set({ status: 'VOIDED', issued_at: null })
      .where(and(eq(refunds.organization_id, organizationId), eq(refunds.id, id)))
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Credits                                                                     */
/* -------------------------------------------------------------------------- */

interface CreditRow {
  id: number
  organization_id: number
  customer_id: number
  amount_minor: number
  remaining_minor: number
  reason: string
  expires_at: string | null
  created_at: string
  created_by: number
}

function mapCredit(row: CreditRow): Credit {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    amountMinor: row.amount_minor,
    remainingMinor: row.remaining_minor,
    reason: row.reason,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const creditRepo = {
  listAll(organizationId: number): Credit[] {
    const rows = getDrizzle()
      .select()
      .from(credits)
      .where(eq(credits.organization_id, organizationId))
      .orderBy(asc(credits.created_at))
      .all() as CreditRow[]
    return rows.map(mapCredit)
  },

  getById(organizationId: number, id: number): Credit | null {
    const row = getDrizzle()
      .select()
      .from(credits)
      .where(and(eq(credits.organization_id, organizationId), eq(credits.id, id)))
      .get() as CreditRow | undefined
    return row ? mapCredit(row) : null
  },

  getByCustomer(organizationId: number, customerId: number): Credit[] {
    const rows = getDrizzle()
      .select()
      .from(credits)
      .where(and(eq(credits.organization_id, organizationId), eq(credits.customer_id, customerId)))
      .orderBy(asc(credits.created_at))
      .all() as CreditRow[]
    return rows.map(mapCredit)
  },

  getBalance(organizationId: number, customerId: number): number {
    const row = getDrizzle()
      .select({ total: sql<number>`COALESCE(SUM(${credits.remaining_minor}), 0)` })
      .from(credits)
      .where(and(eq(credits.organization_id, organizationId), eq(credits.customer_id, customerId)))
      .get() as { total: number }
    return row.total
  },

  create(input: {
    organizationId: number
    customerId: number
    amountMinor: number
    reason: string
    expiresAt: string | null
    createdBy: number
  }): Credit {
    const row = getDrizzle()
      .insert(credits)
      .values({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        amount_minor: input.amountMinor,
        remaining_minor: input.amountMinor,
        reason: input.reason,
        expires_at: input.expiresAt,
        created_by: input.createdBy
      })
      .returning()
      .get() as CreditRow
    return mapCredit(row)
  },

  decrementRemaining(organizationId: number, id: number, amount: number): void {
    getDrizzle()
      .update(credits)
      .set({
        remaining_minor: sql`${credits.remaining_minor} - ${amount}`
      })
      .where(and(eq(credits.organization_id, organizationId), eq(credits.id, id)))
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Credit Allocations                                                          */
/* -------------------------------------------------------------------------- */

interface CreditAllocationRow {
  id: number
  organization_id: number
  credit_id: number
  invoice_id: number
  amount_minor: number
  created_at: string
  created_by: number
}

function mapCreditAllocation(row: CreditAllocationRow): CreditAllocation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    creditId: row.credit_id,
    invoiceId: row.invoice_id,
    amountMinor: row.amount_minor,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const creditAllocationRepo = {
  listByCredits(organizationId: number, creditIds: number[]): CreditAllocation[] {
    if (creditIds.length === 0) return []
    const rows = getDrizzle()
      .select()
      .from(creditAllocations)
      .where(
        and(
          eq(creditAllocations.organization_id, organizationId),
          sql`${creditAllocations.credit_id} IN (${sql.join(
            creditIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as CreditAllocationRow[]
    return rows.map(mapCreditAllocation)
  },

  listByCredit(organizationId: number, creditId: number): CreditAllocation[] {
    const rows = getDrizzle()
      .select()
      .from(creditAllocations)
      .where(
        and(
          eq(creditAllocations.organization_id, organizationId),
          eq(creditAllocations.credit_id, creditId)
        )
      )
      .all() as CreditAllocationRow[]
    return rows.map(mapCreditAllocation)
  },

  listByInvoice(organizationId: number, invoiceId: number): CreditAllocation[] {
    const rows = getDrizzle()
      .select()
      .from(creditAllocations)
      .where(
        and(
          eq(creditAllocations.organization_id, organizationId),
          eq(creditAllocations.invoice_id, invoiceId)
        )
      )
      .all() as CreditAllocationRow[]
    return rows.map(mapCreditAllocation)
  },

  create(input: {
    organizationId: number
    creditId: number
    invoiceId: number
    amountMinor: number
    createdBy: number
  }): CreditAllocation {
    const row = getDrizzle()
      .insert(creditAllocations)
      .values({
        organization_id: input.organizationId,
        credit_id: input.creditId,
        invoice_id: input.invoiceId,
        amount_minor: input.amountMinor,
        created_by: input.createdBy
      })
      .returning()
      .get() as CreditAllocationRow
    return mapCreditAllocation(row)
  }
}
