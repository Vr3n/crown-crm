import { and, asc, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { customers, memberships, membershipFreezes, membershipEvents } from '../db/schema'
import type {
  Customer,
  Membership,
  MembershipFreeze,
  MembershipEvent,
  MembershipStatus,
  FreezeBillingBehavior,
  FreezeAccessBehavior,
  MembershipEventType,
  CancellationReasonCode
} from '../domain/membership'

/**
 * Module 02 repositories. Object-literal repo (matching identity.ts/sales.ts),
 * org-scoped on every query, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary.
 */

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

interface CustomerRow {
  id: number
  organization_id: number
  person_id: number
  billing_name: string | null
  billing_phone: string | null
  billing_email: string | null
  billing_address: string | null
  emergency_contact: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    billingName: row.billing_name,
    billingPhone: row.billing_phone,
    billingEmail: row.billing_email,
    billingAddress: row.billing_address,
    emergencyContact: row.emergency_contact,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const customerRepo = {
  getById(organizationId: number, id: number): Customer | null {
    const row = getDrizzle()
      .select()
      .from(customers)
      .where(and(eq(customers.organization_id, organizationId), eq(customers.id, id)))
      .get() as CustomerRow | undefined
    return row ? mapCustomer(row) : null
  },

  getByPersonId(organizationId: number, personId: number): Customer | null {
    const row = getDrizzle()
      .select()
      .from(customers)
      .where(and(eq(customers.organization_id, organizationId), eq(customers.person_id, personId)))
      .get() as CustomerRow | undefined
    return row ? mapCustomer(row) : null
  },

  create(input: {
    organizationId: number
    personId: number
    billingName: string | null
    billingPhone: string | null
    billingEmail: string | null
    billingAddress: string | null
    emergencyContact: string | null
    notes: string | null
  }): Customer {
    const row = getDrizzle()
      .insert(customers)
      .values({
        organization_id: input.organizationId,
        person_id: input.personId,
        billing_name: input.billingName,
        billing_phone: input.billingPhone,
        billing_email: input.billingEmail,
        billing_address: input.billingAddress,
        emergency_contact: input.emergencyContact,
        notes: input.notes
      })
      .returning()
      .get() as CustomerRow
    return mapCustomer(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      billingName: string | null
      billingPhone: string | null
      billingEmail: string | null
      billingAddress: string | null
      emergencyContact: string | null
      notes: string | null
    }
  ): void {
    getDrizzle()
      .update(customers)
      .set({
        billing_name: input.billingName,
        billing_phone: input.billingPhone,
        billing_email: input.billingEmail,
        billing_address: input.billingAddress,
        emergency_contact: input.emergencyContact,
        notes: input.notes,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(customers.organization_id, organizationId), eq(customers.id, id)))
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Memberships                                                                 */
/* -------------------------------------------------------------------------- */

interface MembershipRow {
  id: number
  organization_id: number
  customer_id: number
  plan_id: number
  offer_id: number | null
  plan_name_snapshot: string
  duration_days_snapshot: number
  base_price_minor: number
  discount_minor: number
  final_price_minor: number
  tax_rate_bps: number
  joining_date: string
  start_date: string
  end_date: string
  billing_frequency: string
  status: string
  cancellation_requested_at: string | null
  cancellation_effective_date: string | null
  cancellation_reason: string | null
  cancellation_reason_code: string | null
  created_at: string
  created_by: number
}

function mapMembership(row: MembershipRow): Membership {
  return {
    id: row.id,
    organizationId: row.organization_id,
    customerId: row.customer_id,
    planId: row.plan_id,
    offerId: row.offer_id,
    planNameSnapshot: row.plan_name_snapshot,
    durationDaysSnapshot: row.duration_days_snapshot,
    basePriceMinor: row.base_price_minor,
    discountMinor: row.discount_minor,
    finalPriceMinor: row.final_price_minor,
    taxRateBps: row.tax_rate_bps,
    joiningDate: row.joining_date,
    startDate: row.start_date,
    endDate: row.end_date,
    billingFrequency: row.billing_frequency,
    status: row.status as MembershipStatus,
    cancellationRequestedAt: row.cancellation_requested_at,
    cancellationEffectiveDate: row.cancellation_effective_date,
    cancellationReason: row.cancellation_reason,
    cancellationReasonCode: row.cancellation_reason_code as CancellationReasonCode | null,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const membershipRepo = {
  getById(organizationId: number, id: number): Membership | null {
    const row = getDrizzle()
      .select()
      .from(memberships)
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.id, id)))
      .get() as MembershipRow | undefined
    return row ? mapMembership(row) : null
  },

  getByCustomer(organizationId: number, customerId: number): Membership[] {
    const rows = getDrizzle()
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
    return rows.map(mapMembership)
  },

  getActiveByDate(organizationId: number, customerId: number, today: string): Membership | null {
    const row = getDrizzle()
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organization_id, organizationId),
          eq(memberships.customer_id, customerId),
          eq(memberships.status, 'ACTIVE'),
          sql`${memberships.start_date} <= ${today}`,
          sql`${memberships.end_date} >= ${today}`
        )
      )
      .get() as MembershipRow | undefined
    return row ? mapMembership(row) : null
  },

  create(input: {
    organizationId: number
    customerId: number
    planId: number
    offerId: number | null
    planNameSnapshot: string
    durationDaysSnapshot: number
    basePriceMinor: number
    discountMinor: number
    finalPriceMinor: number
    taxRateBps: number
    joiningDate: string
    startDate: string
    endDate: string
    billingFrequency: string
    status: MembershipStatus
    createdBy: number
  }): Membership {
    const row = getDrizzle()
      .insert(memberships)
      .values({
        organization_id: input.organizationId,
        customer_id: input.customerId,
        plan_id: input.planId,
        offer_id: input.offerId,
        plan_name_snapshot: input.planNameSnapshot,
        duration_days_snapshot: input.durationDaysSnapshot,
        base_price_minor: input.basePriceMinor,
        discount_minor: input.discountMinor,
        final_price_minor: input.finalPriceMinor,
        tax_rate_bps: input.taxRateBps,
        joining_date: input.joiningDate,
        start_date: input.startDate,
        end_date: input.endDate,
        billing_frequency: input.billingFrequency,
        status: input.status,
        created_by: input.createdBy
      })
      .returning()
      .get() as MembershipRow
    return mapMembership(row)
  },

  updateStatus(organizationId: number, id: number, status: MembershipStatus): void {
    getDrizzle()
      .update(memberships)
      .set({ status })
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.id, id)))
      .run()
  },

  updateEndDate(organizationId: number, id: number, endDate: string): void {
    getDrizzle()
      .update(memberships)
      .set({ end_date: endDate })
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.id, id)))
      .run()
  },

  setCancellation(
    organizationId: number,
    id: number,
    data: {
      cancellationRequestedAt: string | null
      cancellationEffectiveDate: string | null
      cancellationReasonCode: CancellationReasonCode | null
      cancellationReason: string | null
    }
  ): void {
    getDrizzle()
      .update(memberships)
      .set({
        cancellation_requested_at: data.cancellationRequestedAt,
        cancellation_effective_date: data.cancellationEffectiveDate,
        cancellation_reason_code: data.cancellationReasonCode,
        cancellation_reason: data.cancellationReason
      })
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.id, id)))
      .run()
  },

  clearCancellation(organizationId: number, id: number): void {
    getDrizzle()
      .update(memberships)
      .set({
        cancellation_requested_at: null,
        cancellation_effective_date: null,
        cancellation_reason_code: null,
        cancellation_reason: null
      })
      .where(and(eq(memberships.organization_id, organizationId), eq(memberships.id, id)))
      .run()
  },

  getOverlappingActive(
    organizationId: number,
    customerId: number,
    startDate: string,
    endDate: string,
    excludeId?: number
  ): Membership | null {
    const conditions = [
      eq(memberships.organization_id, organizationId),
      eq(memberships.customer_id, customerId),
      sql`${memberships.status} IN ('ACTIVE', 'FROZEN')`,
      sql`${memberships.start_date} <= ${endDate}`,
      sql`${memberships.end_date} >= ${startDate}`
    ]
    if (excludeId !== undefined) {
      conditions.push(sql`${memberships.id} != ${excludeId}`)
    }
    const row = getDrizzle()
      .select()
      .from(memberships)
      .where(and(...conditions))
      .get() as MembershipRow | undefined
    return row ? mapMembership(row) : null
  }
}

/* -------------------------------------------------------------------------- */
/* Membership Freezes                                                          */
/* -------------------------------------------------------------------------- */

interface FreezeRow {
  id: number
  organization_id: number
  membership_id: number
  start_date: string
  end_date: string
  reason: string | null
  fee_minor: number
  billing_behavior: string
  access_behavior: string
  extension_days: number
  credit_days: number
  created_at: string
  created_by: number
}

function mapFreeze(row: FreezeRow): MembershipFreeze {
  return {
    id: row.id,
    organizationId: row.organization_id,
    membershipId: row.membership_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    feeMinor: row.fee_minor,
    billingBehavior: row.billing_behavior as FreezeBillingBehavior,
    accessBehavior: row.access_behavior as FreezeAccessBehavior,
    extensionDays: row.extension_days,
    creditDays: row.credit_days,
    createdAt: row.created_at,
    createdBy: row.created_by
  }
}

export const freezeRepo = {
  getByMembership(organizationId: number, membershipId: number): MembershipFreeze[] {
    const rows = getDrizzle()
      .select()
      .from(membershipFreezes)
      .where(
        and(
          eq(membershipFreezes.organization_id, organizationId),
          eq(membershipFreezes.membership_id, membershipId)
        )
      )
      .orderBy(asc(membershipFreezes.start_date))
      .all() as FreezeRow[]
    return rows.map(mapFreeze)
  },

  getActiveFreeze(
    organizationId: number,
    membershipId: number,
    today: string
  ): MembershipFreeze | null {
    const row = getDrizzle()
      .select()
      .from(membershipFreezes)
      .where(
        and(
          eq(membershipFreezes.organization_id, organizationId),
          eq(membershipFreezes.membership_id, membershipId),
          sql`${membershipFreezes.start_date} <= ${today}`,
          sql`${membershipFreezes.end_date} >= ${today}`
        )
      )
      .get() as FreezeRow | undefined
    return row ? mapFreeze(row) : null
  },

  create(input: {
    organizationId: number
    membershipId: number
    startDate: string
    endDate: string
    reason: string | null
    feeMinor: number
    billingBehavior: FreezeBillingBehavior
    accessBehavior: FreezeAccessBehavior
    extensionDays: number
    creditDays: number
    createdBy: number
  }): MembershipFreeze {
    const row = getDrizzle()
      .insert(membershipFreezes)
      .values({
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        start_date: input.startDate,
        end_date: input.endDate,
        reason: input.reason,
        fee_minor: input.feeMinor,
        billing_behavior: input.billingBehavior,
        access_behavior: input.accessBehavior,
        extension_days: input.extensionDays,
        credit_days: input.creditDays,
        created_by: input.createdBy
      })
      .returning()
      .get() as FreezeRow
    return mapFreeze(row)
  },

  closeOpenFreezes(organizationId: number, membershipId: number, today: string): void {
    getDrizzle()
      .update(membershipFreezes)
      .set({ end_date: today })
      .where(
        and(
          eq(membershipFreezes.organization_id, organizationId),
          eq(membershipFreezes.membership_id, membershipId),
          sql`${membershipFreezes.end_date} > ${today}`
        )
      )
      .run()
  }
}

/* -------------------------------------------------------------------------- */
/* Membership Events                                                           */
/* -------------------------------------------------------------------------- */

interface EventRow {
  id: number
  organization_id: number
  membership_id: number
  type: string
  data: string | null
  occurred_at: string
  created_by: number
}

function mapEvent(row: EventRow): MembershipEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    membershipId: row.membership_id,
    type: row.type as MembershipEventType,
    data: row.data,
    occurredAt: row.occurred_at,
    createdBy: row.created_by
  }
}

export const membershipEventRepo = {
  listByMembership(organizationId: number, membershipId: number): MembershipEvent[] {
    const rows = getDrizzle()
      .select()
      .from(membershipEvents)
      .where(
        and(
          eq(membershipEvents.organization_id, organizationId),
          eq(membershipEvents.membership_id, membershipId)
        )
      )
      .orderBy(asc(membershipEvents.occurred_at))
      .all() as EventRow[]
    return rows.map(mapEvent)
  },

  create(input: {
    organizationId: number
    membershipId: number
    type: MembershipEventType
    data: string | null
    createdBy: number
  }): MembershipEvent {
    const row = getDrizzle()
      .insert(membershipEvents)
      .values({
        organization_id: input.organizationId,
        membership_id: input.membershipId,
        type: input.type,
        data: input.data,
        created_by: input.createdBy
      })
      .returning()
      .get() as EventRow
    return mapEvent(row)
  },

  getSourceInvoiceId(organizationId: number, membershipId: number): number | null {
    const row = getDrizzle()
      .select()
      .from(membershipEvents)
      .where(
        and(
          eq(membershipEvents.organization_id, organizationId),
          eq(membershipEvents.membership_id, membershipId),
          eq(membershipEvents.type, 'CREATED')
        )
      )
      .get() as EventRow | undefined
    if (!row?.data) return null
    try {
      const parsed = JSON.parse(row.data)
      return typeof parsed.invoiceId === 'number' ? parsed.invoiceId : null
    } catch {
      return null
    }
  }
}
