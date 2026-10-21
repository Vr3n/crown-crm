import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'

/**
 * Catalog & Offers schema (Module 03). Reference/lookup data: plans are editable
 * freely because Memberships/Invoices snapshot their commercial terms at sale
 * time (Module 03 §10) — these tables are only the *current* pricing catalog.
 *
 * Prices are stored in integer minor units (paise) — never floats (guidelines
 * §10). Plans are NOT inventory: no quantity/stock columns.
 */
export const membershipPlans = sqliteTable(
  'membership_plans',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    /** Membership term: MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY. */
    duration: text('duration').notNull(),
    /** How the plan is billed: ONE_TIME / MONTHLY / QUARTERLY / HALF_YEARLY / YEARLY. */
    billing_frequency: text('billing_frequency').notNull().default('ONE_TIME'),
    /** Base price in paise (integer minor units) — the number that must never change after a sale. */
    base_price_minor: integer('base_price_minor').notNull(),
    /** Facility access window: ALL_HOURS / TIMED. */
    access_window: text('access_window').notNull().default('ALL_HOURS'),
    /** 'HH:MM' when access_window is TIMED. */
    start_time: text('start_time'),
    /** 'HH:MM' when access_window is TIMED. */
    end_time: text('end_time'),
    /** Snapshot source for invoice lines — e.g. 'GST18'. */
    tax_code: text('tax_code'),
    /** Tax rate in basis points, e.g. 1800 = 18.00%. */
    tax_rate_bps: integer('tax_rate_bps').notNull().default(0),
    /** One-time registration fee in paise charged at the first sale of this plan. */
    registration_fee_minor: integer('registration_fee_minor').notNull().default(0),
    /** Freeze policy applied when this plan's membership is frozen (nullable = org default). */
    freeze_policy_id: integer('freeze_policy_id').references(() => freezePolicies.id),
    /** Proration policy applied on mid-term plan changes (nullable = org default). */
    proration_policy_id: integer('proration_policy_id').references(() => prorationPolicies.id),
    /** Cancellation policy applied when this plan's membership is cancelled (nullable = org default). */
    cancellation_policy_id: integer('cancellation_policy_id').references(
      () => cancellationPolicies.id
    ),
    /** ISO date (yyyy-mm-dd) when the plan becomes available for sale. Default = today. */
    available_from: text('available_from'),
    /** ISO date; null = open-ended (available until manually deactivated). */
    available_to: text('available_to'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_membership_plans_org').on(table.organization_id)
  ]
)

/**
 * Price history for a plan. A row is written on every plan update capturing the
 * outgoing `base_price_minor`/`tax_rate_bps` (Module 03 §versioning) so the
 * catalog keeps an audit trail even though Memberships snapshot prices at sale.
 */
export const membershipPlanVersions = sqliteTable(
  'membership_plan_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    plan_id: integer('plan_id')
      .notNull()
      .references(() => membershipPlans.id),
    /** The price this version made current — the plan row now holds a newer value. */
    base_price_minor: integer('base_price_minor').notNull(),
    tax_rate_bps: integer('tax_rate_bps').notNull().default(0),
    /** When this version became effective — the moment it replaced the previous price. */
    effective_from: text('effective_from').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_plan_versions_org_plan').on(table.organization_id, table.plan_id)]
)

/**
 * A promotional pricing rule layered on plans. Discount math is snapshotted onto
 * the Membership/Invoice at sale time, so offers change freely. Offers are
 * deactivated (`active = 0`), never hard-deleted — redemptions keep their FK.
 *
 * `value_minor` carries the discount by type: PERCENTAGE stores bps-free percent
 * (e.g. 20 = 20%), FIXED_AMOUNT/OVERRIDE_PRICE store paise, FREE_PERIOD stores
 * whole months.
 */
export const offers = sqliteTable(
  'offers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    description: text('description'),
    /** FIXED_AMOUNT / PERCENTAGE / OVERRIDE_PRICE / FREE_PERIOD. */
    discount_type: text('discount_type').notNull(),
    /** Meaning depends on discount_type — see table comment. Integer paise except %/months. */
    value_minor: integer('value_minor').notNull(),
    /** JSON number[] of membership_plans ids; empty array = applies to every plan. */
    applicable_plan_ids: text('applicable_plan_ids').notNull().default('[]'),
    eligibility: text('eligibility'),
    /** ISO date (yyyy-mm-dd) when the offer starts being applicable at sale time. */
    valid_from: text('valid_from').notNull(),
    /** ISO date; null = no end. */
    valid_to: text('valid_to'),
    /** Total redemptions allowed; null = unlimited. */
    max_usage: integer('max_usage'),
    /** Sale-time minimum purchase the offer requires, in paise. */
    min_purchase_minor: integer('min_purchase_minor'),
    /** Soft-delete flag — deactivate never hard-deletes (redemptions reference it). */
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_offers_org').on(table.organization_id),
    index('idx_offers_org_active').on(table.organization_id, table.active)
  ]
)

/**
 * Ledger of offer usage. `usedCount` on offer rows is derived from this table —
 * never stored. membership_id/invoice_id FKs are deferred until the memberships
 * and invoices tables land (they are plain nullable integer columns for now).
 */
export const offerRedemptions = sqliteTable(
  'offer_redemptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    offer_id: integer('offer_id')
      .notNull()
      .references(() => offers.id),
    /** FK deferred until memberships table lands — plain column for now. */
    membership_id: integer('membership_id'),
    /** FK deferred until invoices table lands — plain column for now. */
    invoice_id: integer('invoice_id'),
    /** The discount actually applied, in paise. */
    applied_discount_minor: integer('applied_discount_minor').notNull(),
    redeemed_at: text('redeemed_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [index('idx_offer_redemptions_org_offer').on(table.organization_id, table.offer_id)]
)

/**
 * Discount history for an offer. A row is written on every offer update capturing
 * the outgoing `discount_type`/`value_minor` so the catalog keeps an audit trail
 * even though Memberships/Invoices snapshot their discount at sale time.
 */
export const offerVersions = sqliteTable(
  'offer_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    offer_id: integer('offer_id')
      .notNull()
      .references(() => offers.id),
    /** FIXED_AMOUNT / PERCENTAGE / OVERRIDE_PRICE / FREE_PERIOD. */
    discount_type: text('discount_type').notNull(),
    /** The discount value this version made current — the offer row now holds a newer value. */
    value_minor: integer('value_minor').notNull(),
    /** When this version became effective — the moment it replaced the previous values. */
    effective_from: text('effective_from').notNull(),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_offer_versions_org_offer').on(table.organization_id, table.offer_id)]
)

/**
 * Freeze policy — how a membership pause behaves (ADR-0008: policy is data
 * referenced by the plan, not one global rule).
 */
export const freezePolicies = sqliteTable(
  'freeze_policies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    /** SUSPEND_BILLING / CONTINUE_BILLING. */
    billing_behavior: text('billing_behavior').notNull(),
    /** NO_ACCESS / LIMITED_ACCESS. */
    access_behavior: text('access_behavior').notNull(),
    /** EXTEND_END_DATE / CREDIT_PERIOD / NONE. */
    extend_or_credit: text('extend_or_credit').notNull(),
    /** Fee charged per freeze in paise. */
    fee_minor: integer('fee_minor').notNull().default(0),
    /** Free freezes allowed per membership year before the fee applies. */
    free_freeze_count_per_year: integer('free_freeze_count_per_year').notNull().default(0),
    description: text('description'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_freeze_policies_org').on(table.organization_id)
  ]
)

/**
 * Proration policy — how a mid-term plan change is priced (ADR-0008).
 */
export const prorationPolicies = sqliteTable(
  'proration_policies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    /** UPGRADE_CREDIT_UNUSED / DOWNGRADE_CHARGE_REMAINDER / NO_PARTIAL_CREDIT / CUSTOM. */
    rule: text('rule').notNull(),
    description: text('description'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_proration_policies_org').on(table.organization_id)
  ]
)

/**
 * Cancellation policy — how a membership termination takes effect (ADR-0008).
 */
export const cancellationPolicies = sqliteTable(
  'cancellation_policies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    /** IMMEDIATE / END_OF_PERIOD / NOTICE_DAYS. */
    effective_rule: text('effective_rule').notNull(),
    /** Whole days of notice required when effective_rule is NOTICE_DAYS. */
    notice_days: integer('notice_days'),
    description: text('description'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_cancellation_policies_org').on(table.organization_id)
  ]
)
