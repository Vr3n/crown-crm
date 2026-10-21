import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'
import { people } from './sales'
import { membershipPlans, offers } from './catalog'

/**
 * Customers & Memberships schema (Module 02).
 *
 * Customer is the stable person; each membership row is one purchased entitlement
 * period. Membership status is a cache — ground truth is dates plus freeze records
 * (Module 02 §technical decision). Prices are snapshotted at sale time and never
 * recomputed from the plan (Module 03 §10).
 */
export const customers = sqliteTable(
  'customers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    /** One customer per person (ADR-0009). */
    person_id: integer('person_id')
      .notNull()
      .references(() => people.id),
    /** Contact snapshot for invoices (Module 02 §21, Module 04 §4). */
    billing_name: text('billing_name'),
    billing_phone: text('billing_phone'),
    billing_email: text('billing_email'),
    billing_address: text('billing_address'),
    emergency_contact: text('emergency_contact'),
    notes: text('notes'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.person_id),
    index('idx_customers_org').on(table.organization_id)
  ]
)

/**
 * Each row is one purchased entitlement period. Commercial terms are snapshotted
 * at sale time and never recomputed from the plan/offer (Module 03 §33, Scenario 3).
 * Status is a cache derived from dates + freeze records (Module 02 §technical decision).
 */
export const memberships = sqliteTable(
  'memberships',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    customer_id: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    plan_id: integer('plan_id')
      .notNull()
      .references(() => membershipPlans.id),
    offer_id: integer('offer_id').references(() => offers.id),
    /** Commercial snapshot (Module 03 §33, Scenario 3). */
    plan_name_snapshot: text('plan_name_snapshot').notNull(),
    duration_days_snapshot: integer('duration_days_snapshot').notNull(),
    base_price_minor: integer('base_price_minor').notNull(),
    discount_minor: integer('discount_minor').notNull().default(0),
    final_price_minor: integer('final_price_minor').notNull(),
    tax_rate_bps: integer('tax_rate_bps').notNull(),
    /** Entitlement window. */
    /** Calendar date the customer is expected to physically join the gym. */
    joining_date: text('joining_date').notNull(),
    start_date: text('start_date').notNull(),
    end_date: text('end_date').notNull(),
    billing_frequency: text('billing_frequency').notNull(),
    /** Cache — derive from dates + freezes. PENDING / ACTIVE / FROZEN / EXPIRED / CANCELLED / TERMINATED. */
    status: text('status').notNull().default('PENDING'),
    /** Cancellation (Module 02 §30). */
    cancellation_requested_at: text('cancellation_requested_at'),
    cancellation_effective_date: text('cancellation_effective_date'),
    cancellation_reason: text('cancellation_reason'),
    cancellation_reason_code: text('cancellation_reason_code'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [
    index('idx_memberships_org_customer').on(table.organization_id, table.customer_id),
    index('idx_memberships_org_status').on(table.organization_id, table.status)
  ]
)

/**
 * Freeze is a record with policy fields — never `is_frozen` (Module 02 §8, Scenario 6).
 * Records who/when/start/end/reason/billing consequence/access consequence/extension.
 */
export const membershipFreezes = sqliteTable(
  'membership_freezes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    membership_id: integer('membership_id')
      .notNull()
      .references(() => memberships.id),
    start_date: text('start_date').notNull(),
    end_date: text('end_date').notNull(),
    reason: text('reason'),
    fee_minor: integer('fee_minor').notNull().default(0),
    /** SUSPEND_BILLING / CONTINUE_BILLING (from plan's freeze_policy). */
    billing_behavior: text('billing_behavior').notNull(),
    /** NO_ACCESS / LIMITED_ACCESS. */
    access_behavior: text('access_behavior').notNull(),
    /** End-date shift applied (FREEZE_EXTENDS_END_DATE). */
    extension_days: integer('extension_days').notNull().default(0),
    /** Credit applied instead (FREEZE_CREDITS_PERIOD). */
    credit_days: integer('credit_days').notNull().default(0),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [index('idx_freezes_membership').on(table.membership_id)]
)

/**
 * History is a first-class record (Module 02 §32); never overwrite old memberships.
 * Each event captures the type, optional JSON detail, and who performed it.
 */
export const membershipEvents = sqliteTable(
  'membership_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    membership_id: integer('membership_id')
      .notNull()
      .references(() => memberships.id),
    /** CREATED / ACTIVATED / FROZEN / UNFROZEN / RENEWED / PLAN_CHANGED / CANCELLATION_REQUESTED / CANCELLED / EXPIRED / TERMINATED */
    type: text('type').notNull(),
    /** JSON detail (e.g. freeze id, old→new plan). */
    data: text('data'),
    occurred_at: text('occurred_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id)
  },
  (table) => [index('idx_membership_events_membership').on(table.membership_id)]
)
