import { asc, eq, and, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  customers,
  people,
  memberships,
  invoices,
  invoiceLines,
  paymentAllocations
} from '../db/schema'
import { currentOrganizationId } from '../auth/session'
import { memberRecordRequestSchema } from '../../shared/contracts/dashboard'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

/**
 * Dashboard IPC handlers (Module 09 read models).
 * Returns expiring memberships, payments due, and member records.
 */

interface PersonRow {
  id: number
  full_name: string
  phone: string | null
  email: string | null
}

interface MembershipRow {
  id: number
  customer_id: number
  plan_id: number
  plan_name_snapshot: string
  start_date: string
  end_date: string
  joining_date: string
  final_price_minor: number
  status: string
  created_at: string
}

interface InvoiceRow {
  id: number
  number: string
  customer_id: number
  status: string
  total_minor: number
  created_at: string
}

interface InvoiceLineRow {
  id: number
  invoice_id: number
  description: string
  plan_id: number | null
}

interface AllocationRow {
  invoice_id: number
  amount_minor: number
}

export function registerDashboardIpc(): void {
  handle(IPC_CHANNELS.DASHBOARD_EXPIRATIONS, () => {
    const organizationId = currentOrganizationId()
    const today = new Date().toISOString().slice(0, 10)
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Get active memberships expiring within 30 days
    const membershipRows = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.status, 'ACTIVE'),
          sql`${memberships.end_date} >= ${today}`,
          sql`${memberships.end_date} <= ${futureDate}`
        )
      )
      .orderBy(asc(memberships.end_date))
      .all() as MembershipRow[]

    if (membershipRows.length === 0) return []

    // Fetch customers and people
    const customerIds = [...new Set(membershipRows.map((m) => m.customer_id))]
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
    const personRows = getDrizzle()
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
      .all() as PersonRow[]
    const personMap = new Map(personRows.map((p) => [p.id, p]))
    const personByCustomer = new Map(customerRows.map((c) => [c.id, personMap.get(c.person_id)]))

    return membershipRows.map((m) => {
      const person = personByCustomer.get(m.customer_id)
      return {
        id: String(m.id),
        member: {
          id: String(m.customer_id),
          name: person?.full_name ?? 'Unknown',
          personId: person ? String(person.id) : undefined,
          phone: person?.phone ?? undefined,
          email: person?.email ?? undefined
        },
        plan: m.plan_name_snapshot,
        purchasedAt: m.start_date,
        expiresAt: m.end_date,
        // Renewal shortcut (#110): enough to open the renew dialog directly.
        customerId: String(m.customer_id),
        planId: m.plan_id != null ? String(m.plan_id) : null,
        joiningDate: m.joining_date
      }
    })
  })

  handle(IPC_CHANNELS.DASHBOARD_PAYMENTS_DUE, () => {
    const organizationId = currentOrganizationId()

    // Get open/partially paid invoices
    const invoiceRows = getDrizzle()
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

    if (invoiceRows.length === 0) return []

    // Fetch allocations to compute paid amounts
    const invoiceIds = invoiceRows.map((i) => i.id)
    const allocRows = getDrizzle()
      .select()
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.organization_id, organizationId),
          sql`${paymentAllocations.invoice_id} IN (${sql.join(
            invoiceIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as AllocationRow[]
    const paidByInvoice = new Map<number, number>()
    for (const a of allocRows) {
      paidByInvoice.set(a.invoice_id, (paidByInvoice.get(a.invoice_id) ?? 0) + a.amount_minor)
    }

    // Fetch customers and people
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
    const personRows = getDrizzle()
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
      .all() as PersonRow[]
    const personMap = new Map(personRows.map((p) => [p.id, p]))
    const personByCustomer = new Map(customerRows.map((c) => [c.id, personMap.get(c.person_id)]))

    // Fetch first line description and plan_id for each invoice
    const allLines = getDrizzle()
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.organization_id, organizationId),
          sql`${invoiceLines.invoice_id} IN (${sql.join(
            invoiceIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .all() as InvoiceLineRow[]
    const firstLineByInvoice = new Map<number, string>()
    const planIdByInvoice = new Map<number, number | null>()
    for (const l of allLines) {
      if (!firstLineByInvoice.has(l.invoice_id)) {
        firstLineByInvoice.set(l.invoice_id, l.description)
        planIdByInvoice.set(l.invoice_id, l.plan_id)
      }
    }

    // Fetch memberships for these customers to get plan duration and membership amount
    const membershipRows = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          sql`${memberships.customer_id} IN (${sql.join(
            customerIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      )
      .orderBy(sql`${memberships.created_at} DESC`)
      .all() as MembershipRow[]
    // Key: "customerId-planId" → most recent membership
    const membershipByKey = new Map<string, MembershipRow>()
    for (const m of membershipRows) {
      const key = `${m.customer_id}-${m.plan_id}`
      if (!membershipByKey.has(key)) {
        membershipByKey.set(key, m)
      }
    }

    return invoiceRows.map((inv) => {
      const person = personByCustomer.get(inv.customer_id)
      const paid = paidByInvoice.get(inv.id) ?? 0
      const firstPlanId = planIdByInvoice.get(inv.id)
      const membership =
        firstPlanId != null ? membershipByKey.get(`${inv.customer_id}-${firstPlanId}`) : undefined
      return {
        id: String(inv.id),
        member: {
          id: String(inv.customer_id),
          name: person?.full_name ?? 'Unknown',
          personId: person ? String(person.id) : undefined,
          phone: person?.phone ?? undefined,
          email: person?.email ?? undefined
        },
        plan: membership?.plan_name_snapshot ?? firstLineByInvoice.get(inv.id) ?? 'Invoice',
        purchasedAt: inv.created_at,
        amountDueMinor: inv.total_minor - paid,
        totalMinor: inv.total_minor,
        invoiceNumber: inv.number,
        planStartDate: membership?.start_date ?? inv.created_at,
        planEndDate: membership?.end_date ?? inv.created_at,
        joiningDate: membership?.joining_date ?? inv.created_at,
        membershipAmountMinor: membership?.final_price_minor ?? inv.total_minor,
        membershipPurchasedAt: membership?.created_at ?? inv.created_at,
        // Renewal shortcut (#110, Phase 2): direct renew-dialog inputs.
        // Latest membership for this customer+plan; null when unresolvable —
        // callers hide the Renew action instead of guessing.
        customerId: String(inv.customer_id),
        membershipId: membership ? String(membership.id) : null,
        renewPlanId:
          membership?.plan_id != null
            ? String(membership.plan_id)
            : firstPlanId != null
              ? String(firstPlanId)
              : null
      }
    })
  })

  handle(IPC_CHANNELS.DASHBOARD_MEMBER_RECORD, memberRecordRequestSchema, (input) => {
    const organizationId = currentOrganizationId()
    const customerId = parseInt(input.memberId, 10)

    const customerRow = getDrizzle()
      .select()
      .from(customers)
      .where(and(eq(customers.organization_id, organizationId), eq(customers.id, customerId)))
      .get() as { person_id: number; created_at: string } | undefined

    if (!customerRow) return undefined

    // Get latest membership
    const membership = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.customer_id, customerId)
        )
      )
      .orderBy(asc(memberships.created_at))
      .all() as MembershipRow[]
    const latestMembership = membership[membership.length - 1]

    // Get invoices
    const invoiceRows = getDrizzle()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.organization_id, organizationId), eq(invoices.customer_id, customerId))
      )
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]

    if (!latestMembership) {
      return {
        membership: {
          plan: 'No membership',
          purchasedAt: customerRow.created_at,
          expiresAt: ''
        },
        invoices: invoiceRows.map((inv) => ({
          id: String(inv.id),
          invoiceNo: inv.number,
          label: 'Invoice',
          periodStart: inv.created_at,
          periodEnd: inv.created_at,
          amountMinor: inv.total_minor,
          status: (inv.status === 'PAID' ? 'PAID' : 'OVERDUE') as 'PAID' | 'OVERDUE',
          paidAt: inv.status === 'PAID' ? inv.created_at : undefined
        }))
      }
    }

    return {
      membership: {
        plan: latestMembership.plan_name_snapshot,
        purchasedAt: latestMembership.start_date,
        expiresAt: latestMembership.end_date
      },
      lead: undefined,
      invoices: invoiceRows.map((inv) => ({
        id: String(inv.id),
        invoiceNo: inv.number,
        label: 'Invoice',
        periodStart: inv.created_at,
        periodEnd: inv.created_at,
        amountMinor: inv.total_minor,
        status: (inv.status === 'PAID' ? 'PAID' : 'OVERDUE') as 'PAID' | 'OVERDUE',
        paidAt: inv.status === 'PAID' ? inv.created_at : undefined
      }))
    }
  })

  handle(IPC_CHANNELS.DASHBOARD_PAYMENT_RECORD, memberRecordRequestSchema, (input) => {
    const organizationId = currentOrganizationId()
    const customerId = parseInt(input.memberId, 10)

    const customerRow = getDrizzle()
      .select()
      .from(customers)
      .where(and(eq(customers.organization_id, organizationId), eq(customers.id, customerId)))
      .get() as { person_id: number; created_at: string } | undefined

    if (!customerRow) return undefined

    // Get latest membership
    const membership = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.customer_id, customerId)
        )
      )
      .orderBy(asc(memberships.created_at))
      .all() as MembershipRow[]
    const latestMembership = membership[membership.length - 1]

    // Get invoices
    const invoiceRows = getDrizzle()
      .select()
      .from(invoices)
      .where(
        and(eq(invoices.organization_id, organizationId), eq(invoices.customer_id, customerId))
      )
      .orderBy(asc(invoices.created_at))
      .all() as InvoiceRow[]

    if (!latestMembership) {
      return {
        membership: {
          plan: 'No membership',
          purchasedAt: customerRow.created_at,
          expiresAt: ''
        },
        invoices: invoiceRows.map((inv) => ({
          id: String(inv.id),
          invoiceNo: inv.number,
          label: 'Invoice',
          periodStart: inv.created_at,
          periodEnd: inv.created_at,
          amountMinor: inv.total_minor,
          status: (inv.status === 'PAID' ? 'PAID' : 'OVERDUE') as 'PAID' | 'OVERDUE',
          paidAt: inv.status === 'PAID' ? inv.created_at : undefined
        }))
      }
    }

    return {
      membership: {
        plan: latestMembership.plan_name_snapshot,
        purchasedAt: latestMembership.start_date,
        expiresAt: latestMembership.end_date
      },
      lead: undefined,
      invoices: invoiceRows.map((inv) => ({
        id: String(inv.id),
        invoiceNo: inv.number,
        label: 'Invoice',
        periodStart: inv.created_at,
        periodEnd: inv.created_at,
        amountMinor: inv.total_minor,
        status: (inv.status === 'PAID' ? 'PAID' : 'OVERDUE') as 'PAID' | 'OVERDUE',
        paidAt: inv.status === 'PAID' ? inv.created_at : undefined
      }))
    }
  })
}
