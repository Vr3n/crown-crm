import { and, eq } from 'drizzle-orm'
import { getDrizzle } from './connection'
import { withTransaction } from './connection'
import {
  cancellationPolicies,
  freezePolicies,
  leadActivityTypes,
  leadLostReasons,
  leadSources,
  leadStages,
  membershipPlans,
  offers,
  paymentMethods,
  permissions,
  prorationPolicies,
  rolePermissions,
  roles
} from './schema'
import { ALL_PERMISSION_CODES } from './permissions'

export interface SeedRole {
  name: string
  is_system: boolean
  is_super: boolean
  permissions: string[]
}

/**
 * The per-organization starter roles, shipped as editable data (not compiled logic).
 * Owner and Admin are the two system roles and are is_super; everything else is
 * ordinary and editable via RolePermission rows. Non-super grant sets follow the
 * Module 15 worked example, mapped onto the current permission catalog.
 */
export const SEED_ROLES: SeedRole[] = [
  { name: 'Owner', is_system: true, is_super: true, permissions: [] },
  { name: 'Admin', is_system: true, is_super: true, permissions: [] },
  {
    name: 'Manager',
    is_system: false,
    is_super: false,
    permissions: [
      'org.view',
      'user.view',
      'role.view',
      'person.blacklist',
      'lead.view',
      'lead.create',
      'lead.assign',
      'lead.record_activity',
      'lead.update_stage',
      'lead.mark_lost',
      'lead.convert',
      'lead.delete',
      'lead.edit',
      'followup.view',
      'followup.create',
      'followup.update',
      'followup.cancel',
      'followup.complete',
      'plan.view',
      'plan.create',
      'plan.update',
      'plan.deactivate',
      'offer.view',
      'offer.create',
      'offer.update',
      'offer.deactivate',
      'membership.view',
      'membership.create',
      'membership.sell',
      'membership.activate',
      'membership.freeze',
      'membership.unfreeze',
      'membership.renew',
      'membership.change_plan',
      'membership.request_cancellation',
      'membership.cancel',
      'invoice.view',
      'invoice.create',
      'invoice.finalize',
      'invoice.void',
      'payment.view',
      'payment.record',
      'payment.allocate',
      'refund.view',
      'refund.create',
      'credit.view',
      'credit.create',
      'credit.apply',
      'report.view'
    ]
  },
  {
    name: 'Sales',
    is_system: false,
    is_super: false,
    permissions: [
      'person.blacklist',
      'lead.view',
      'lead.create',
      'lead.record_activity',
      'lead.update_stage',
      'lead.convert',
      'lead.delete',
      'lead.edit',
      'followup.view',
      'followup.create',
      'followup.update',
      'followup.cancel',
      'followup.complete',
      'plan.view',
      'offer.view',
      'membership.view',
      'membership.create',
      'membership.sell',
      'membership.activate'
    ]
  },
  {
    name: 'Front Desk',
    is_system: false,
    is_super: false,
    permissions: [
      'person.blacklist',
      'lead.view',
      'lead.record_activity',
      'followup.view',
      'followup.create',
      'followup.update',
      'followup.cancel',
      'followup.complete',
      'membership.view'
    ]
  },
  {
    name: 'Finance',
    is_system: false,
    is_super: false,
    permissions: [
      'invoice.view',
      'invoice.finalize',
      'invoice.void',
      'payment.view',
      'payment.record',
      'payment.allocate',
      'refund.view',
      'refund.create',
      'credit.view',
      'credit.create',
      'credit.apply',
      'report.view'
    ]
  }
]

/**
 * Seeds the global permission catalog once. Call after migrations. Uses
 * ON CONFLICT DO NOTHING so re-running after a catalog extension is a no-op
 * for codes that already exist (same semantics as the shipped INSERT OR IGNORE).
 */
export function seedPermissions(): void {
  const db = getDrizzle()
  db.insert(permissions)
    .values(ALL_PERMISSION_CODES.map((code) => ({ code, description: null })))
    .onConflictDoNothing()
    .run()
}

/**
 * Creates the starter roles for a given organization. Runs inside its own
 * transaction; should be called within the org-setup flow. Role rows are
 * inserted unconditionally — a second call for the same org violates the
 * (organization_id, name) unique constraint, matching the shipped behavior.
 */
export function seedRolesForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()

    const permissionIds = new Map(
      db
        .select({ id: permissions.id, code: permissions.code })
        .from(permissions)
        .all()
        .map((row) => [row.code, row.id])
    )

    for (const role of SEED_ROLES) {
      const inserted = db
        .insert(roles)
        .values({
          organization_id: organizationId,
          name: role.name,
          is_system_role: role.is_system,
          is_super: role.is_super,
          description: null
        })
        .returning({ id: roles.id })
        .get()
      const roleId = inserted.id

      for (const code of role.permissions) {
        const permissionId = permissionIds.get(code)
        if (permissionId === undefined) continue
        db.insert(rolePermissions)
          .values({ role_id: roleId, permission_id: permissionId })
          .onConflictDoNothing()
          .run()
      }
    }
  })
}

/** The recommended starter stage pipeline (Module 01 §Lead Stage). */
export const SEED_STAGES: Array<{
  name: string
  isInitial?: boolean
  isWon?: boolean
  isLost?: boolean
  suppressFollowups?: boolean
}> = [
  { name: 'NEW', isInitial: true },
  { name: 'CONTACTED' },
  { name: 'INTERESTED' },
  { name: 'VISIT_SCHEDULED' },
  { name: 'VISITED' },
  { name: 'TRIAL' },
  { name: 'NEGOTIATION' },
  { name: 'WON', isWon: true },
  { name: 'LOST', isLost: true },
  { name: 'DO_NOT_DISTURB', suppressFollowups: true },
  { name: 'NOT_INTERESTED', suppressFollowups: true }
]

/** Recommended enquiry sources (Module 01 §Lead Source). */
export const SEED_SOURCES = [
  'Walk-in',
  'Phone',
  'Referral',
  'Instagram',
  'Website',
  'Advertisement',
  'Existing Member Referral',
  'Other'
]

/** Recommended activity vocabulary (Module 01 §Lead Activity). */
export const SEED_ACTIVITY_TYPES = [
  'PHONE_CALL',
  'WALK_IN',
  'WHATSAPP',
  'GYM_TOUR',
  'TRIAL',
  'NOTE',
  'PRICE_DISCUSSION',
  'MEMBERSHIP_PROPOSAL',
  'OWNER_CHANGE'
]

/** Recommended lost-lead reasons (Module 01 §Lost Lead). */
export const SEED_LOST_REASONS = [
  'Too Expensive',
  'Joined Competitor',
  'Not Interested',
  'No Response',
  'Moved Away',
  'Medical Reason',
  'Wrong Contact',
  'Other'
]

/** Default payment methods (Module 05). */
export const SEED_PAYMENT_METHODS = ['UPI', 'CASH', 'CREDIT CARD', 'DEBIT CARD']

export interface SeedPlan {
  name: string
  duration: string
  billing: string
  basePriceMinor: number
  accessWindow: string
  startTime: string | null
  endTime: string | null
  active: boolean
  description: string
}

/**
 * Recommended starter plans (Module 03 §Catalog). Mirrors the renderer's demo
 * catalog so a fresh install has something to sell and the lead form has plans
 * to pick from. Prices are integer minor units (paise).
 */
export const SEED_PLANS: SeedPlan[] = [
  {
    name: 'Annual',
    duration: 'YEARLY',
    billing: 'YEARLY',
    basePriceMinor: 800000,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    active: true,
    description: 'Full-facility access for a year, billed yearly.'
  },
  {
    name: 'Quarterly',
    duration: 'QUARTERLY',
    billing: 'QUARTERLY',
    basePriceMinor: 400000,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    active: true,
    description: 'Full-facility access for a quarter, billed quarterly.'
  },
  {
    name: 'Monthly',
    duration: 'MONTHLY',
    billing: 'ONE_TIME',
    basePriceMinor: 500000,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    active: true,
    description: 'Full-facility access for one month, paid upfront.'
  }
]

/**
 * Provisions the org's sales reference data: stages, sources, activity types,
 * and lost reasons. Runs inside its own transaction and is called from the
 * org-setup flow right after `seedRolesForOrganization`. The (organization_id,
 * name) unique constraints guard against double-seeding; a second call for the
 * same org would violate them, matching the shipped role-seed behavior.
 */
export function seedSalesReferenceData(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()

    SEED_STAGES.forEach((s, i) => {
      db.insert(leadStages)
        .values({
          organization_id: organizationId,
          name: s.name,
          sort_order: i,
          is_initial: Boolean(s.isInitial),
          is_won: Boolean(s.isWon),
          is_lost: Boolean(s.isLost),
          suppress_followups: Boolean(s.suppressFollowups)
        })
        .run()
    })

    SEED_SOURCES.forEach((name, i) => {
      db.insert(leadSources).values({ organization_id: organizationId, name, sort_order: i }).run()
    })

    SEED_ACTIVITY_TYPES.forEach((name) => {
      db.insert(leadActivityTypes).values({ organization_id: organizationId, name }).run()
    })

    SEED_LOST_REASONS.forEach((name, i) => {
      db.insert(leadLostReasons)
        .values({ organization_id: organizationId, name, sort_order: i })
        .run()
    })
  })
}

/**
 * Provisions the org's starter membership plans. Runs inside its own transaction
 * and is called from the org-setup flow right after `seedSalesReferenceData`.
 * The (organization_id, name) unique constraint guards against double-seeding.
 */
export function seedPlansForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()
    for (const plan of SEED_PLANS) {
      db.insert(membershipPlans)
        .values({
          organization_id: organizationId,
          name: plan.name,
          description: plan.description,
          duration: plan.duration,
          billing_frequency: plan.billing,
          base_price_minor: plan.basePriceMinor,
          access_window: plan.accessWindow,
          start_time: plan.startTime,
          end_time: plan.endTime,
          active: plan.active,
          available_from: new Date().toISOString().slice(0, 10),
          available_to: null
        })
        .run()
    }
  })
}

export interface SeedOffer {
  name: string
  description: string
  discountType: string
  valueMinor: number
  applicablePlanIds: number[]
  validFrom: string
  validTo: string | null
  maxUsage: number | null
  minPurchaseMinor: number | null
  eligibility: string | null
  active: boolean
}

/** Starter discount rules (Module 03 §Offers). Seeded per org so a fresh install
 * has usable discounts at sale time. The (organization_id, name) unique
 * constraint guards against double-seeding. */
export const SEED_OFFERS: SeedOffer[] = [
  {
    name: 'BARGAINING_DISCOUNT',
    description: 'Use this when customer is bargaining while creating invoice.',
    discountType: 'PERCENTAGE',
    valueMinor: 10,
    applicablePlanIds: [],
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: null,
    maxUsage: null,
    minPurchaseMinor: null,
    eligibility: null,
    active: true
  }
]

/**
 * Provisions the org's starter discount offers. Runs inside its own transaction
 * and is called from the org-setup flow right after `seedPlansForOrganization`.
 * The (organization_id, name) unique constraint guards against double-seeding.
 */
export function seedOffersForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()
    for (const offer of SEED_OFFERS) {
      db.insert(offers)
        .values({
          organization_id: organizationId,
          name: offer.name,
          description: offer.description,
          discount_type: offer.discountType,
          value_minor: offer.valueMinor,
          applicable_plan_ids: JSON.stringify(offer.applicablePlanIds),
          valid_from: offer.validFrom,
          valid_to: offer.validTo,
          max_usage: offer.maxUsage,
          min_purchase_minor: offer.minPurchaseMinor,
          eligibility: offer.eligibility,
          active: offer.active
        })
        .run()
    }
  })
}

export interface SeedFreezePolicy {
  name: string
  billingBehavior: string
  accessBehavior: string
  extendOrCredit: string
  feeMinor: number
  freeFreezeCountPerYear: number
  description: string
}

export interface SeedProrationPolicy {
  name: string
  rule: string
  description: string
}

export interface SeedCancellationPolicy {
  name: string
  effectiveRule: string
  noticeDays: number | null
  description: string
}

/**
 * Default membership policies (Module 03, ADR-0008: policy is data, referenced
 * by the plan). Seeded per org so a fresh install has sensible defaults and the
 * plan editor has lookups to pick from.
 */
export const SEED_FREEZE_POLICIES: SeedFreezePolicy[] = [
  {
    name: 'Standard Freeze',
    billingBehavior: 'SUSPEND_BILLING',
    accessBehavior: 'NO_ACCESS',
    extendOrCredit: 'EXTEND_END_DATE',
    feeMinor: 0,
    freeFreezeCountPerYear: 2,
    description: 'Billing pauses and the end date extends for the frozen period.'
  },
  {
    name: 'Credit Freeze',
    billingBehavior: 'SUSPEND_BILLING',
    accessBehavior: 'LIMITED_ACCESS',
    extendOrCredit: 'CREDIT_PERIOD',
    feeMinor: 0,
    freeFreezeCountPerYear: 1,
    description: 'Billing pauses and the frozen time is credited back to the member.'
  },
  {
    name: 'Paid Freeze',
    billingBehavior: 'SUSPEND_BILLING',
    accessBehavior: 'NO_ACCESS',
    extendOrCredit: 'EXTEND_END_DATE',
    feeMinor: 19900,
    freeFreezeCountPerYear: 0,
    description: 'Every freeze beyond the free allowance is charged a flat fee.'
  }
]

export const SEED_PRORATION_POLICIES: SeedProrationPolicy[] = [
  {
    name: 'Standard Proration',
    rule: 'UPGRADE_CREDIT_UNUSED',
    description: 'Upgrades credit the unused value of the current period.'
  },
  {
    name: 'Downgrade Remainder',
    rule: 'DOWNGRADE_CHARGE_REMAINDER',
    description: 'Downgrades charge the remainder of the current period at the new rate.'
  },
  {
    name: 'No Partial Credit',
    rule: 'NO_PARTIAL_CREDIT',
    description: 'Mid-term changes take effect at the next billing period with no proration.'
  }
]

export const SEED_CANCELLATION_POLICIES: SeedCancellationPolicy[] = [
  {
    name: 'Immediate',
    effectiveRule: 'IMMEDIATE',
    noticeDays: null,
    description: 'Cancellation takes effect immediately and the remaining time is forfeited.'
  },
  {
    name: 'End of Period',
    effectiveRule: 'END_OF_PERIOD',
    noticeDays: null,
    description: 'Cancellation takes effect at the end of the current billing period.'
  },
  {
    name: '14 Days Notice',
    effectiveRule: 'NOTICE_DAYS',
    noticeDays: 14,
    description: 'A 14-day notice is required before cancellation takes effect.'
  }
]

/** Defaults attached to seeded plans: freeze, proration, cancellation by name. */
export const DEFAULT_POLICY_NAMES = {
  freeze: 'Standard Freeze',
  proration: 'Standard Proration',
  cancellation: 'End of Period'
} as const

/**
 * Provisions the org's default freeze/proration/cancellation policies and
 * attaches them to the org's seeded plans. Runs inside its own transaction and
 * is called from the org-setup flow right after `seedPlansForOrganization`. The
 * (organization_id, name) unique constraints guard against double-seeding.
 */
export function seedCatalogPoliciesForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()

    for (const policy of SEED_FREEZE_POLICIES) {
      db.insert(freezePolicies)
        .values({
          organization_id: organizationId,
          name: policy.name,
          billing_behavior: policy.billingBehavior,
          access_behavior: policy.accessBehavior,
          extend_or_credit: policy.extendOrCredit,
          fee_minor: policy.feeMinor,
          free_freeze_count_per_year: policy.freeFreezeCountPerYear,
          description: policy.description
        })
        .run()
    }

    for (const policy of SEED_PRORATION_POLICIES) {
      db.insert(prorationPolicies)
        .values({
          organization_id: organizationId,
          name: policy.name,
          rule: policy.rule,
          description: policy.description
        })
        .run()
    }

    for (const policy of SEED_CANCELLATION_POLICIES) {
      db.insert(cancellationPolicies)
        .values({
          organization_id: organizationId,
          name: policy.name,
          effective_rule: policy.effectiveRule,
          notice_days: policy.noticeDays,
          description: policy.description
        })
        .run()
    }

    const freeze = db
      .select({ id: freezePolicies.id })
      .from(freezePolicies)
      .where(
        and(
          eq(freezePolicies.organization_id, organizationId),
          eq(freezePolicies.name, DEFAULT_POLICY_NAMES.freeze)
        )
      )
      .get()
    const proration = db
      .select({ id: prorationPolicies.id })
      .from(prorationPolicies)
      .where(
        and(
          eq(prorationPolicies.organization_id, organizationId),
          eq(prorationPolicies.name, DEFAULT_POLICY_NAMES.proration)
        )
      )
      .get()
    const cancellation = db
      .select({ id: cancellationPolicies.id })
      .from(cancellationPolicies)
      .where(
        and(
          eq(cancellationPolicies.organization_id, organizationId),
          eq(cancellationPolicies.name, DEFAULT_POLICY_NAMES.cancellation)
        )
      )
      .get()

    db.update(membershipPlans)
      .set({
        freeze_policy_id: freeze?.id ?? null,
        proration_policy_id: proration?.id ?? null,
        cancellation_policy_id: cancellation?.id ?? null
      })
      .where(eq(membershipPlans.organization_id, organizationId))
      .run()
  })
}

/**
 * Provisions the org's default payment methods. Runs inside its own transaction
 * and is called from the org-setup flow. The (organization_id, name) unique
 * constraint guards against double-seeding.
 */
export function seedPaymentMethodsForOrganization(organizationId: number): void {
  withTransaction(() => {
    const db = getDrizzle()
    SEED_PAYMENT_METHODS.forEach((name, i) => {
      db.insert(paymentMethods)
        .values({
          organization_id: organizationId,
          name,
          sort_order: i
        })
        .run()
    })
  })
}
