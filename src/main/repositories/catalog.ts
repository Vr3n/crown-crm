import { and, asc, count, desc, eq, sql } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import {
  cancellationPolicies,
  freezePolicies,
  membershipPlanVersions,
  membershipPlans,
  offerRedemptions,
  offerVersions,
  offers,
  prorationPolicies
} from '../db/schema'
import type {
  CancellationPolicy,
  FreezePolicy,
  MembershipPlan,
  MembershipPlanVersion,
  Offer,
  OfferDiscountType,
  OfferVersion,
  PlanAccessWindow,
  PlanBillingFrequency,
  PlanDuration,
  ProrationPolicy
} from '../domain/catalog'

/**
 * Module 03 repositories. Object-literal repo (matching identity.ts/sales.ts),
 * org-scoped on every query, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary (§5).
 */

interface MembershipPlanRow {
  id: number
  organization_id: number
  name: string
  description: string | null
  duration: string
  billing_frequency: string
  base_price_minor: number
  access_window: string
  start_time: string | null
  end_time: string | null
  tax_code: string | null
  tax_rate_bps: number
  registration_fee_minor: number
  freeze_policy_id: number | null
  proration_policy_id: number | null
  cancellation_policy_id: number | null
  available_from: string | null
  available_to: string | null
  active: boolean
  created_at: string
  updated_at: string
}

function mapPlan(row: MembershipPlanRow): MembershipPlan {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    duration: row.duration as PlanDuration,
    billingFrequency: row.billing_frequency as PlanBillingFrequency,
    basePriceMinor: row.base_price_minor,
    accessWindow: row.access_window as PlanAccessWindow,
    startTime: row.start_time,
    endTime: row.end_time,
    taxCode: row.tax_code,
    taxRateBps: row.tax_rate_bps,
    registrationFeeMinor: row.registration_fee_minor,
    freezePolicyId: row.freeze_policy_id,
    prorationPolicyId: row.proration_policy_id,
    cancellationPolicyId: row.cancellation_policy_id,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const planRepo = {
  list(organizationId: number): MembershipPlan[] {
    const rows = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(eq(membershipPlans.organization_id, organizationId))
      .all() as MembershipPlanRow[]
    return rows.map(mapPlan)
  },

  getById(organizationId: number, id: number): MembershipPlan | null {
    const row = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .get() as MembershipPlanRow | undefined
    return row ? mapPlan(row) : null
  },

  /** Case-insensitive name lookup, for duplicate detection. */
  findByName(organizationId: number, name: string): MembershipPlan | null {
    const row = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.organization_id, organizationId),
          sql`lower(${membershipPlans.name}) = lower(${name})`
        )
      )
      .get() as MembershipPlanRow | undefined
    return row ? mapPlan(row) : null
  },

  create(input: {
    organizationId: number
    name: string
    description: string | null
    duration: PlanDuration
    billingFrequency: PlanBillingFrequency
    basePriceMinor: number
    accessWindow: PlanAccessWindow
    startTime: string | null
    endTime: string | null
    taxCode: string | null
    taxRateBps: number
    registrationFeeMinor: number
    freezePolicyId: number | null
    prorationPolicyId: number | null
    cancellationPolicyId: number | null
    availableFrom: string | null
    availableTo: string | null
    active: boolean
  }): MembershipPlan {
    const row = getDrizzle()
      .insert(membershipPlans)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        description: input.description,
        duration: input.duration,
        billing_frequency: input.billingFrequency,
        base_price_minor: input.basePriceMinor,
        access_window: input.accessWindow,
        start_time: input.startTime,
        end_time: input.endTime,
        tax_code: input.taxCode,
        tax_rate_bps: input.taxRateBps,
        registration_fee_minor: input.registrationFeeMinor,
        freeze_policy_id: input.freezePolicyId,
        proration_policy_id: input.prorationPolicyId,
        cancellation_policy_id: input.cancellationPolicyId,
        available_from: input.availableFrom,
        available_to: input.availableTo,
        active: input.active
      })
      .returning()
      .get() as MembershipPlanRow
    return mapPlan(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      name: string
      description: string | null
      duration: PlanDuration
      billingFrequency: PlanBillingFrequency
      basePriceMinor: number
      accessWindow: PlanAccessWindow
      startTime: string | null
      endTime: string | null
      taxCode: string | null
      taxRateBps: number
      registrationFeeMinor: number
      freezePolicyId: number | null
      prorationPolicyId: number | null
      cancellationPolicyId: number | null
      availableFrom: string | null
      availableTo: string | null
      active: boolean
    }
  ): void {
    getDrizzle()
      .update(membershipPlans)
      .set({
        name: input.name,
        description: input.description,
        duration: input.duration,
        billing_frequency: input.billingFrequency,
        base_price_minor: input.basePriceMinor,
        access_window: input.accessWindow,
        start_time: input.startTime,
        end_time: input.endTime,
        tax_code: input.taxCode,
        tax_rate_bps: input.taxRateBps,
        registration_fee_minor: input.registrationFeeMinor,
        freeze_policy_id: input.freezePolicyId,
        proration_policy_id: input.prorationPolicyId,
        cancellation_policy_id: input.cancellationPolicyId,
        available_from: input.availableFrom,
        available_to: input.availableTo,
        active: input.active,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .run()
  },

  delete(organizationId: number, id: number): void {
    getDrizzle()
      .delete(membershipPlans)
      .where(and(eq(membershipPlans.organization_id, organizationId), eq(membershipPlans.id, id)))
      .run()
  },

  /** Active plans matching the query, for the lead form's plan picker. */
  searchActive(
    organizationId: number,
    query: string,
    limit: number
  ): { id: number; name: string }[] {
    return getDrizzle()
      .select({ id: membershipPlans.id, name: membershipPlans.name })
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.organization_id, organizationId),
          eq(membershipPlans.active, true),
          sql`lower(${membershipPlans.name}) like ${`%${query.toLowerCase()}%`}`
        )
      )
      .orderBy(membershipPlans.name)
      .limit(limit)
      .all()
  },

  /**
   * Plans available for sale right now: active, within the availability window
   * (available_from <= today, available_to IS NULL OR available_to >= today).
   * Used by the sales form's plan picker.
   */
  listAvailableForSale(organizationId: number, today: string): MembershipPlan[] {
    const rows = getDrizzle()
      .select()
      .from(membershipPlans)
      .where(
        and(
          eq(membershipPlans.organization_id, organizationId),
          eq(membershipPlans.active, true),
          sql`(${membershipPlans.available_from} IS NULL OR ${membershipPlans.available_from} <= ${today})`,
          sql`(${membershipPlans.available_to} IS NULL OR ${membershipPlans.available_to} >= ${today})`
        )
      )
      .orderBy(membershipPlans.name)
      .all() as MembershipPlanRow[]
    return rows.map(mapPlan)
  }
}

/* -------------------------------------------------------------------------- */
/* Plan versions                                                               */
/* -------------------------------------------------------------------------- */

interface PlanVersionRow {
  id: number
  organization_id: number
  plan_id: number
  base_price_minor: number
  tax_rate_bps: number
  effective_from: string
  created_at: string
}

function mapPlanVersion(row: PlanVersionRow): MembershipPlanVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    basePriceMinor: row.base_price_minor,
    taxRateBps: row.tax_rate_bps,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at
  }
}

export const planVersionRepo = {
  create(input: {
    organizationId: number
    planId: number
    basePriceMinor: number
    taxRateBps: number
    effectiveFrom: string
  }): MembershipPlanVersion {
    const row = getDrizzle()
      .insert(membershipPlanVersions)
      .values({
        organization_id: input.organizationId,
        plan_id: input.planId,
        base_price_minor: input.basePriceMinor,
        tax_rate_bps: input.taxRateBps,
        effective_from: input.effectiveFrom
      })
      .returning()
      .get() as PlanVersionRow
    return mapPlanVersion(row)
  },

  /** Version history for a plan, oldest first. */
  listByPlan(organizationId: number, planId: number): MembershipPlanVersion[] {
    const rows = getDrizzle()
      .select()
      .from(membershipPlanVersions)
      .where(
        and(
          eq(membershipPlanVersions.organization_id, organizationId),
          eq(membershipPlanVersions.plan_id, planId)
        )
      )
      .orderBy(asc(membershipPlanVersions.created_at), asc(membershipPlanVersions.id))
      .all() as PlanVersionRow[]
    return rows.map(mapPlanVersion)
  }
}

/* -------------------------------------------------------------------------- */
/* Offer versions                                                               */
/* -------------------------------------------------------------------------- */

interface OfferVersionRow {
  id: number
  organization_id: number
  offer_id: number
  discount_type: string
  value_minor: number
  effective_from: string
  created_at: string
}

function mapOfferVersion(row: OfferVersionRow): OfferVersion {
  return {
    id: row.id,
    organizationId: row.organization_id,
    offerId: row.offer_id,
    discountType: row.discount_type as OfferDiscountType,
    valueMinor: row.value_minor,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at
  }
}

export const offerVersionRepo = {
  create(input: {
    organizationId: number
    offerId: number
    discountType: OfferDiscountType
    valueMinor: number
    effectiveFrom: string
  }): OfferVersion {
    const row = getDrizzle()
      .insert(offerVersions)
      .values({
        organization_id: input.organizationId,
        offer_id: input.offerId,
        discount_type: input.discountType,
        value_minor: input.valueMinor,
        effective_from: input.effectiveFrom
      })
      .returning()
      .get() as OfferVersionRow
    return mapOfferVersion(row)
  },

  /** Version history for an offer, oldest first. */
  listByOffer(organizationId: number, offerId: number): OfferVersion[] {
    const rows = getDrizzle()
      .select()
      .from(offerVersions)
      .where(
        and(eq(offerVersions.organization_id, organizationId), eq(offerVersions.offer_id, offerId))
      )
      .orderBy(asc(offerVersions.created_at), asc(offerVersions.id))
      .all() as OfferVersionRow[]
    return rows.map(mapOfferVersion)
  }
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                      */
/* -------------------------------------------------------------------------- */

interface OfferRow {
  id: number
  organization_id: number
  name: string
  description: string | null
  discount_type: string
  value_minor: number
  applicable_plan_ids: string
  eligibility: string | null
  valid_from: string
  valid_to: string | null
  max_usage: number | null
  min_purchase_minor: number | null
  active: boolean
  created_at: string
  updated_at: string
}

function parsePlanIds(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((n): n is number => Number.isInteger(n))
  } catch {
    // corrupt JSON should never happen (written via JSON.stringify) — treat as empty
  }
  return []
}

function mapOffer(row: OfferRow): Offer {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    discountType: row.discount_type as OfferDiscountType,
    valueMinor: row.value_minor,
    applicablePlanIds: parsePlanIds(row.applicable_plan_ids),
    eligibility: row.eligibility,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    maxUsage: row.max_usage,
    minPurchaseMinor: row.min_purchase_minor,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export type OfferWithUsage = Offer & { usedCount: number }

interface OfferUsageRow extends OfferRow {
  used_count: number
}

function mapOfferWithUsage(row: OfferUsageRow): OfferWithUsage {
  return { ...mapOffer(row), usedCount: row.used_count }
}

const offerWithUsageColumns = {
  id: offers.id,
  organization_id: offers.organization_id,
  name: offers.name,
  description: offers.description,
  discount_type: offers.discount_type,
  value_minor: offers.value_minor,
  applicable_plan_ids: offers.applicable_plan_ids,
  eligibility: offers.eligibility,
  valid_from: offers.valid_from,
  valid_to: offers.valid_to,
  max_usage: offers.max_usage,
  min_purchase_minor: offers.min_purchase_minor,
  active: offers.active,
  created_at: offers.created_at,
  updated_at: offers.updated_at,
  used_count: count(offerRedemptions.id).as('used_count')
}

export const offerRepo = {
  /** All offers for the org with derived usedCount, active offers first. */
  listWithUsage(organizationId: number): OfferWithUsage[] {
    const rows = getDrizzle()
      .select(offerWithUsageColumns)
      .from(offers)
      .leftJoin(offerRedemptions, eq(offerRedemptions.offer_id, offers.id))
      .where(eq(offers.organization_id, organizationId))
      .groupBy(offers.id)
      .orderBy(desc(offers.active), asc(offers.name))
      .all() as unknown as OfferUsageRow[]
    return rows.map(mapOfferWithUsage)
  },

  getById(organizationId: number, id: number): Offer | null {
    const row = getDrizzle()
      .select()
      .from(offers)
      .where(and(eq(offers.organization_id, organizationId), eq(offers.id, id)))
      .get() as OfferRow | undefined
    return row ? mapOffer(row) : null
  },

  getByIdWithUsage(organizationId: number, id: number): OfferWithUsage | null {
    const row = getDrizzle()
      .select(offerWithUsageColumns)
      .from(offers)
      .leftJoin(offerRedemptions, eq(offerRedemptions.offer_id, offers.id))
      .where(and(eq(offers.organization_id, organizationId), eq(offers.id, id)))
      .groupBy(offers.id)
      .get() as unknown as OfferUsageRow | undefined
    return row ? mapOfferWithUsage(row) : null
  },

  findByName(organizationId: number, name: string): Offer | null {
    const row = getDrizzle()
      .select()
      .from(offers)
      .where(
        and(eq(offers.organization_id, organizationId), sql`lower(${offers.name}) = lower(${name})`)
      )
      .get() as OfferRow | undefined
    return row ? mapOffer(row) : null
  },

  countRedemptions(organizationId: number, offerId: number): number {
    const row = getDrizzle()
      .select({ n: count(offerRedemptions.id) })
      .from(offerRedemptions)
      .where(
        and(
          eq(offerRedemptions.organization_id, organizationId),
          eq(offerRedemptions.offer_id, offerId)
        )
      )
      .get() as { n: number }
    return row.n
  },

  create(input: {
    organizationId: number
    name: string
    description: string | null
    discountType: OfferDiscountType
    valueMinor: number
    applicablePlanIds: number[]
    eligibility: string | null
    validFrom: string
    validTo: string | null
    maxUsage: number | null
    minPurchaseMinor: number | null
    active: boolean
  }): Offer {
    const row = getDrizzle()
      .insert(offers)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        description: input.description,
        discount_type: input.discountType,
        value_minor: input.valueMinor,
        applicable_plan_ids: JSON.stringify(input.applicablePlanIds),
        eligibility: input.eligibility,
        valid_from: input.validFrom,
        valid_to: input.validTo,
        max_usage: input.maxUsage,
        min_purchase_minor: input.minPurchaseMinor,
        active: input.active
      })
      .returning()
      .get() as OfferRow
    return mapOffer(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      name: string
      description: string | null
      discountType: OfferDiscountType
      valueMinor: number
      applicablePlanIds: number[]
      eligibility: string | null
      validFrom: string
      validTo: string | null
      maxUsage: number | null
      minPurchaseMinor: number | null
      active: boolean
    }
  ): void {
    getDrizzle()
      .update(offers)
      .set({
        name: input.name,
        description: input.description,
        discount_type: input.discountType,
        value_minor: input.valueMinor,
        applicable_plan_ids: JSON.stringify(input.applicablePlanIds),
        eligibility: input.eligibility,
        valid_from: input.validFrom,
        valid_to: input.validTo,
        max_usage: input.maxUsage,
        min_purchase_minor: input.minPurchaseMinor,
        active: input.active,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(offers.organization_id, organizationId), eq(offers.id, id)))
      .run()
  },

  setActive(organizationId: number, id: number, active: boolean): void {
    getDrizzle()
      .update(offers)
      .set({ active, updated_at: sql`(datetime('now'))` })
      .where(and(eq(offers.organization_id, organizationId), eq(offers.id, id)))
      .run()
  },

  /**
   * Offers eligible at sale time for a plan: active, valid today, not past
   * max usage, and applicable to the plan (empty applicability = all plans).
   * `minPurchaseMinor` is a sale-time decision — the caller applies it.
   */
  listEligibleForPlan(organizationId: number, planId: number, today: string): OfferWithUsage[] {
    const all = this.listWithUsage(organizationId)
    return all.filter((offer) => {
      if (!offer.active) return false
      if (offer.validFrom > today) return false
      if (offer.validTo !== null && offer.validTo < today) return false
      if (offer.maxUsage !== null && offer.usedCount >= offer.maxUsage) return false
      if (offer.applicablePlanIds.length > 0 && !offer.applicablePlanIds.includes(planId)) {
        return false
      }
      return true
    })
  }
}

/* -------------------------------------------------------------------------- */
/* Policies (ADR-0008)                                                         */
/* -------------------------------------------------------------------------- */

interface FreezePolicyRow {
  id: number
  organization_id: number
  name: string
  billing_behavior: string
  access_behavior: string
  extend_or_credit: string
  fee_minor: number
  free_freeze_count_per_year: number
  description: string | null
  created_at: string
  updated_at: string
}

function mapFreezePolicy(row: FreezePolicyRow): FreezePolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    billingBehavior: row.billing_behavior as FreezePolicy['billingBehavior'],
    accessBehavior: row.access_behavior as FreezePolicy['accessBehavior'],
    extendOrCredit: row.extend_or_credit as FreezePolicy['extendOrCredit'],
    feeMinor: row.fee_minor,
    freeFreezeCountPerYear: row.free_freeze_count_per_year,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const freezePolicyRepo = {
  list(organizationId: number): FreezePolicy[] {
    const rows = getDrizzle()
      .select()
      .from(freezePolicies)
      .where(eq(freezePolicies.organization_id, organizationId))
      .orderBy(freezePolicies.name)
      .all() as FreezePolicyRow[]
    return rows.map(mapFreezePolicy)
  },

  getById(organizationId: number, id: number): FreezePolicy | null {
    const row = getDrizzle()
      .select()
      .from(freezePolicies)
      .where(and(eq(freezePolicies.organization_id, organizationId), eq(freezePolicies.id, id)))
      .get() as FreezePolicyRow | undefined
    return row ? mapFreezePolicy(row) : null
  },

  findByName(organizationId: number, name: string): FreezePolicy | null {
    const row = getDrizzle()
      .select()
      .from(freezePolicies)
      .where(
        and(
          eq(freezePolicies.organization_id, organizationId),
          sql`lower(${freezePolicies.name}) = lower(${name})`
        )
      )
      .get() as FreezePolicyRow | undefined
    return row ? mapFreezePolicy(row) : null
  },

  create(input: {
    organizationId: number
    name: string
    billingBehavior: FreezePolicy['billingBehavior']
    accessBehavior: FreezePolicy['accessBehavior']
    extendOrCredit: FreezePolicy['extendOrCredit']
    feeMinor: number
    freeFreezeCountPerYear: number
    description: string | null
  }): FreezePolicy {
    const row = getDrizzle()
      .insert(freezePolicies)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        billing_behavior: input.billingBehavior,
        access_behavior: input.accessBehavior,
        extend_or_credit: input.extendOrCredit,
        fee_minor: input.feeMinor,
        free_freeze_count_per_year: input.freeFreezeCountPerYear,
        description: input.description
      })
      .returning()
      .get() as FreezePolicyRow
    return mapFreezePolicy(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      name: string
      billingBehavior: FreezePolicy['billingBehavior']
      accessBehavior: FreezePolicy['accessBehavior']
      extendOrCredit: FreezePolicy['extendOrCredit']
      feeMinor: number
      freeFreezeCountPerYear: number
      description: string | null
    }
  ): void {
    getDrizzle()
      .update(freezePolicies)
      .set({
        name: input.name,
        billing_behavior: input.billingBehavior,
        access_behavior: input.accessBehavior,
        extend_or_credit: input.extendOrCredit,
        fee_minor: input.feeMinor,
        free_freeze_count_per_year: input.freeFreezeCountPerYear,
        description: input.description,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(freezePolicies.organization_id, organizationId), eq(freezePolicies.id, id)))
      .run()
  }
}

interface ProrationPolicyRow {
  id: number
  organization_id: number
  name: string
  rule: string
  description: string | null
  created_at: string
  updated_at: string
}

function mapProrationPolicy(row: ProrationPolicyRow): ProrationPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    rule: row.rule as ProrationPolicy['rule'],
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const prorationPolicyRepo = {
  list(organizationId: number): ProrationPolicy[] {
    const rows = getDrizzle()
      .select()
      .from(prorationPolicies)
      .where(eq(prorationPolicies.organization_id, organizationId))
      .orderBy(prorationPolicies.name)
      .all() as ProrationPolicyRow[]
    return rows.map(mapProrationPolicy)
  },

  getById(organizationId: number, id: number): ProrationPolicy | null {
    const row = getDrizzle()
      .select()
      .from(prorationPolicies)
      .where(
        and(eq(prorationPolicies.organization_id, organizationId), eq(prorationPolicies.id, id))
      )
      .get() as ProrationPolicyRow | undefined
    return row ? mapProrationPolicy(row) : null
  },

  findByName(organizationId: number, name: string): ProrationPolicy | null {
    const row = getDrizzle()
      .select()
      .from(prorationPolicies)
      .where(
        and(
          eq(prorationPolicies.organization_id, organizationId),
          sql`lower(${prorationPolicies.name}) = lower(${name})`
        )
      )
      .get() as ProrationPolicyRow | undefined
    return row ? mapProrationPolicy(row) : null
  },

  create(input: {
    organizationId: number
    name: string
    rule: ProrationPolicy['rule']
    description: string | null
  }): ProrationPolicy {
    const row = getDrizzle()
      .insert(prorationPolicies)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        rule: input.rule,
        description: input.description
      })
      .returning()
      .get() as ProrationPolicyRow
    return mapProrationPolicy(row)
  },

  update(
    organizationId: number,
    id: number,
    input: { name: string; rule: ProrationPolicy['rule']; description: string | null }
  ): void {
    getDrizzle()
      .update(prorationPolicies)
      .set({
        name: input.name,
        rule: input.rule,
        description: input.description,
        updated_at: sql`(datetime('now'))`
      })
      .where(
        and(eq(prorationPolicies.organization_id, organizationId), eq(prorationPolicies.id, id))
      )
      .run()
  }
}

interface CancellationPolicyRow {
  id: number
  organization_id: number
  name: string
  effective_rule: string
  notice_days: number | null
  description: string | null
  created_at: string
  updated_at: string
}

function mapCancellationPolicy(row: CancellationPolicyRow): CancellationPolicy {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    effectiveRule: row.effective_rule as CancellationPolicy['effectiveRule'],
    noticeDays: row.notice_days,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const cancellationPolicyRepo = {
  list(organizationId: number): CancellationPolicy[] {
    const rows = getDrizzle()
      .select()
      .from(cancellationPolicies)
      .where(eq(cancellationPolicies.organization_id, organizationId))
      .orderBy(cancellationPolicies.name)
      .all() as CancellationPolicyRow[]
    return rows.map(mapCancellationPolicy)
  },

  getById(organizationId: number, id: number): CancellationPolicy | null {
    const row = getDrizzle()
      .select()
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.organization_id, organizationId),
          eq(cancellationPolicies.id, id)
        )
      )
      .get() as CancellationPolicyRow | undefined
    return row ? mapCancellationPolicy(row) : null
  },

  findByName(organizationId: number, name: string): CancellationPolicy | null {
    const row = getDrizzle()
      .select()
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.organization_id, organizationId),
          sql`lower(${cancellationPolicies.name}) = lower(${name})`
        )
      )
      .get() as CancellationPolicyRow | undefined
    return row ? mapCancellationPolicy(row) : null
  },

  create(input: {
    organizationId: number
    name: string
    effectiveRule: CancellationPolicy['effectiveRule']
    noticeDays: number | null
    description: string | null
  }): CancellationPolicy {
    const row = getDrizzle()
      .insert(cancellationPolicies)
      .values({
        organization_id: input.organizationId,
        name: input.name,
        effective_rule: input.effectiveRule,
        notice_days: input.noticeDays,
        description: input.description
      })
      .returning()
      .get() as CancellationPolicyRow
    return mapCancellationPolicy(row)
  },

  update(
    organizationId: number,
    id: number,
    input: {
      name: string
      effectiveRule: CancellationPolicy['effectiveRule']
      noticeDays: number | null
      description: string | null
    }
  ): void {
    getDrizzle()
      .update(cancellationPolicies)
      .set({
        name: input.name,
        effective_rule: input.effectiveRule,
        notice_days: input.noticeDays,
        description: input.description,
        updated_at: sql`(datetime('now'))`
      })
      .where(
        and(
          eq(cancellationPolicies.organization_id, organizationId),
          eq(cancellationPolicies.id, id)
        )
      )
      .run()
  }
}
