import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { organizations, users } from './identity'
import { membershipPlans } from './catalog'

/**
 * Sales & CRM schema (Module 01). All tables are org-scoped: every row carries an
 * `organization_id` and every repository query scopes on it. Stage names are
 * configurable per-org reference data; application logic reads only the boolean
 * flags (`is_initial`/`is_won`/`is_lost`), never the literal name (ADR-0007).
 */

/** People anchor (ADR-0009). Phone is normalized to its bare 10-digit form by the caller. */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    full_name: text('full_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    is_blacklisted: integer('is_blacklisted', { mode: 'boolean' }).notNull().default(false),
    blacklisted_reason: text('blacklisted_reason'),
    blacklisted_at: text('blacklisted_at'),
    blacklisted_by: integer('blacklisted_by').references(() => users.id),
    photo_filename: text('photo_filename'),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [unique().on(table.organization_id, table.phone)]
)

/** A configurable stage in the sales process. Logic reads flags, never names. */
export const leadStages = sqliteTable(
  'lead_stages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    is_initial: integer('is_initial', { mode: 'boolean' }).notNull().default(false),
    is_won: integer('is_won', { mode: 'boolean' }).notNull().default(false),
    is_lost: integer('is_lost', { mode: 'boolean' }).notNull().default(false),
    suppress_followups: integer('suppress_followups', { mode: 'boolean' }).notNull().default(false),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_lead_stages_org').on(table.organization_id)
  ]
)

/** Where the enquiry came from (configurable marketing channels). */
export const leadSources = sqliteTable(
  'lead_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_lead_sources_org').on(table.organization_id)
  ]
)

/** Why a lead was lost (sales-performance analysis). */
export const leadLostReasons = sqliteTable(
  'lead_lost_reasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    sort_order: integer('sort_order').notNull().default(0),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_lead_lost_reasons_org').on(table.organization_id)
  ]
)

/** Configurable activity vocabulary; `lead_activities.type_id` points here. */
export const leadActivityTypes = sqliteTable(
  'lead_activity_types',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    unique().on(table.organization_id, table.name),
    index('idx_lead_activity_types_org').on(table.organization_id)
  ]
)

/**
 * A sales opportunity. There is NO stored status column: the status (OPEN/WON/LOST)
 * is derived from `current_stage_id`'s flags at read time. `customer_id` stays a
 * plain integer until Module 02 lands; its FK is added by the 02 migration.
 */
export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    person_id: integer('person_id')
      .notNull()
      .references(() => people.id),
    source_id: integer('source_id')
      .notNull()
      .references(() => leadSources.id),
    current_stage_id: integer('current_stage_id')
      .notNull()
      .references(() => leadStages.id),
    owner_user_id: integer('owner_user_id').references(() => users.id),
    customer_id: integer('customer_id'),
    /** The plan this lead is interested in — a real FK to the catalog (Module 03). */
    plan_id: integer('plan_id').references(() => membershipPlans.id),
    goal: text('goal'),
    notes: text('notes'),
    lost_reason_id: integer('lost_reason_id').references(() => leadLostReasons.id),
    lost_at: text('lost_at'),
    lost_by: integer('lost_by').references(() => users.id),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updated_at: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_leads_org_stage').on(table.organization_id, table.current_stage_id),
    index('idx_leads_org_owner').on(table.organization_id, table.owner_user_id),
    index('idx_leads_org_source').on(table.organization_id, table.source_id),
    index('idx_leads_org_plan').on(table.organization_id, table.plan_id),
    index('idx_leads_person').on(table.person_id)
  ]
)

/** Immutable record of an interaction/sales event. "Who did this" is mandatory. */
export const leadActivities = sqliteTable(
  'lead_activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    type_id: integer('type_id')
      .notNull()
      .references(() => leadActivityTypes.id),
    note: text('note'),
    occurred_at: text('occurred_at').notNull(),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_lead_activities_lead').on(table.lead_id)]
)

/** Future work: a due action that can be marked done (idempotently). */
export const leadFollowups = sqliteTable(
  'lead_followups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    title: text('title').notNull(),
    due_at: text('due_at').notNull(),
    extension_reason: text('extension_reason'),
    notes: text('notes'),
    completed_at: text('completed_at'),
    completed_by: integer('completed_by').references(() => users.id),
    cancelled_at: text('cancelled_at'),
    cancelled_by: integer('cancelled_by').references(() => users.id),
    cancelled_reason: text('cancelled_reason'),
    created_by: integer('created_by')
      .notNull()
      .references(() => users.id),
    created_at: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [
    index('idx_followups_due').on(table.organization_id, table.due_at, table.completed_at),
    index('idx_followups_lead').on(table.lead_id)
  ]
)

/**
 * Append-only stage history. `activity_id` is NULL only for the initial placement
 * on CreateLead; LOST moves use `reason` instead (the mandatory lost reason is the
 * explicit cause the stage-move rule demands).
 */
export const leadStageHistory = sqliteTable(
  'lead_stage_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    organization_id: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    lead_id: integer('lead_id')
      .notNull()
      .references(() => leads.id),
    from_stage_id: integer('from_stage_id').references(() => leadStages.id),
    to_stage_id: integer('to_stage_id')
      .notNull()
      .references(() => leadStages.id),
    activity_id: integer('activity_id').references(() => leadActivities.id),
    reason: text('reason'),
    changed_by: integer('changed_by')
      .notNull()
      .references(() => users.id),
    changed_at: text('changed_at')
      .notNull()
      .default(sql`(datetime('now'))`)
  },
  (table) => [index('idx_stage_history_lead').on(table.lead_id)]
)
