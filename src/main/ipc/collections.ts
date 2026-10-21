import { asc, eq, and, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { payments, paymentAllocations, invoices, customers, people, users } from '../db/schema'
import { currentOrganizationId } from '../auth/session'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Collections IPC handlers (daily collection report read models).
 * Returns payment records grouped by date, with method totals.
 */

interface PaymentRow {
  id: number
  customer_id: number
  payment_date: string
  amount_minor: number
  payment_method: string
  reference: string | null
  notes: string | null
  created_at: string
  created_by: number
}

interface AllocationRow {
  payment_id: number
  invoice_id: number
  amount_minor: number
}

interface InvoiceRow {
  id: number
  number: string
}

interface PersonRow {
  id: number
  full_name: string
  phone: string | null
  email: string | null
}

interface UserRow {
  id: number
  full_name: string
}

export function registerCollectionsIpc(): void {
  handle(IPC_CHANNELS.COLLECTIONS_PAYMENTS, () => {
    const organizationId = currentOrganizationId()

    const paymentRows = getDrizzle()
      .select()
      .from(payments)
      .where(eq(payments.organization_id, organizationId))
      .orderBy(asc(payments.payment_date))
      .all() as PaymentRow[]

    if (paymentRows.length === 0) return []

    // Fetch allocations
    const paymentIds = paymentRows.map((p) => p.id)
    const allocRows = getDrizzle()
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
    const allocsByPayment = new Map<number, AllocationRow[]>()
    for (const a of allocRows) {
      const list = allocsByPayment.get(a.payment_id) ?? []
      list.push(a)
      allocsByPayment.set(a.payment_id, list)
    }

    // Fetch invoices for allocation display
    const invoiceIds = [...new Set(allocRows.map((a) => a.invoice_id))]
    const invoiceRows =
      invoiceIds.length > 0
        ? (getDrizzle()
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.organization_id, organizationId),
                sql`${invoices.id} IN (${sql.join(
                  invoiceIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
            )
            .all() as InvoiceRow[])
        : []
    const invoiceMap = new Map(invoiceRows.map((i) => [i.id, i.number]))

    // Fetch customers and people
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

    // Fetch users for recordedBy names
    const userIds = [...new Set(paymentRows.map((p) => p.created_by))]
    const userRows =
      userIds.length > 0
        ? (getDrizzle()
            .select()
            .from(users)
            .where(
              sql`${users.id} IN (${sql.join(
                userIds.map((id) => sql`${id}`),
                sql`, `
              )})`
            )
            .all() as UserRow[])
        : []
    const userMap = new Map(userRows.map((u) => [u.id, u.full_name]))

    return paymentRows.map((p) => {
      const person = personByCustomer.get(p.customer_id)
      const allocs = allocsByPayment.get(p.id) ?? []
      return {
        id: String(p.id),
        reference: p.reference ?? `PAY-${p.id}`,
        customer: {
          id: String(p.customer_id),
          name: person?.full_name ?? 'Unknown',
          personId: person ? String(person.id) : undefined,
          phone: person?.phone ?? undefined,
          email: person?.email ?? undefined
        },
        amountMinor: p.amount_minor,
        method: p.payment_method,
        receivedAt: p.payment_date,
        receivedBy: userMap.get(p.created_by) ?? 'Unknown',
        allocations: allocs.map((a) => ({
          invoiceNo: invoiceMap.get(a.invoice_id) ?? `INV-${a.invoice_id}`,
          amountMinor: a.amount_minor
        })),
        notes: p.notes ?? undefined
      }
    })
  })

  handle(IPC_CHANNELS.COLLECTIONS_PAYMENT, (paymentId: number) => {
    const organizationId = currentOrganizationId()

    const payment = getDrizzle()
      .select()
      .from(payments)
      .where(and(eq(payments.organization_id, organizationId), eq(payments.id, paymentId)))
      .get() as PaymentRow | undefined

    if (!payment) return undefined

    const allocRows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          eq(paymentAllocations.payment_id, paymentId)
        )
      )
      .all() as AllocationRow[]

    const invoiceIds = allocRows.map((a) => a.invoice_id)
    const invoiceRows =
      invoiceIds.length > 0
        ? (getDrizzle()
            .select()
            .from(invoices)
            .where(
              and(
                eq(invoices.organization_id, organizationId),
                sql`${invoices.id} IN (${sql.join(
                  invoiceIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
            )
            .all() as InvoiceRow[])
        : []
    const invoiceMap = new Map(invoiceRows.map((i) => [i.id, i.number]))

    const customer = getDrizzle()
      .select()
      .from(customers)
      .where(
        and(eq(customers.organization_id, organizationId), eq(customers.id, payment.customer_id))
      )
      .get() as { person_id: number } | undefined

    const person = customer
      ? (getDrizzle()
          .select()
          .from(people)
          .where(and(eq(people.organization_id, organizationId), eq(people.id, customer.person_id)))
          .get() as PersonRow | undefined)
      : undefined

    const user = getDrizzle().select().from(users).where(eq(users.id, payment.created_by)).get() as
      UserRow | undefined

    return {
      id: String(payment.id),
      reference: payment.reference ?? `PAY-${payment.id}`,
      customer: {
        id: String(payment.customer_id),
        name: person?.full_name ?? 'Unknown',
        personId: customer ? String(customer.person_id) : undefined,
        phone: person?.phone ?? undefined,
        email: person?.email ?? undefined
      },
      amountMinor: payment.amount_minor,
      method: payment.payment_method,
      receivedAt: payment.payment_date,
      receivedBy: user?.full_name ?? 'Unknown',
      allocations: allocRows.map((a) => ({
        invoiceNo: invoiceMap.get(a.invoice_id) ?? `INV-${a.invoice_id}`,
        amountMinor: a.amount_minor
      })),
      notes: payment.notes ?? undefined
    }
  })
}
