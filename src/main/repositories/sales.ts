import { and, count, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { getDrizzle } from '../db/connection'
import { logger } from '../lib/logger'
import {
  leadActivities,
  leadActivityTypes,
  leadFollowups,
  leadLostReasons,
  leadSources,
  leadStageHistory,
  leadStages,
  leads,
  membershipPlans,
  people,
  users
} from '../db/schema'
import {
  Lead,
  LeadActivity,
  LeadFollowup,
  LeadStage,
  LeadStageHistoryEntry,
  Person
} from '../domain/lead'

/**
 * Module 01 repositories. Object-literal repos (matching identity.ts), org-scoped
 * on every query, explicit joins, `getDrizzle()`. Repositories never open or close
 * transactions — the application use case owns the transaction boundary (§5).
 */

interface PersonRow {
  id: number
  organization_id: number
  full_name: string
  phone: string
  email: string | null
  is_blacklisted: boolean
  blacklisted_reason: string | null
  blacklisted_at: string | null
  blacklisted_by: number | null
  photo_filename: string | null
  created_at: string
  updated_at: string
}

interface LeadRow {
  id: number
  organization_id: number
  person_id: number
  source_id: number
  current_stage_id: number
  owner_user_id: number | null
  customer_id: number | null
  plan_id: number | null
  goal: string | null
  notes: string | null
  lost_reason_id: number | null
  lost_at: string | null
  lost_by: number | null
  created_by: number
  created_at: string
  updated_at: string
}

interface LeadStageRow {
  id: number
  organization_id: number
  name: string
  sort_order: number
  is_initial: boolean
  is_won: boolean
  is_lost: boolean
  suppress_followups: boolean
  active: boolean
  created_at: string
}

interface ActivityRow {
  id: number
  organization_id: number
  lead_id: number
  type_id: number
  note: string | null
  occurred_at: string
  created_by: number
  created_at: string
}

interface FollowupRow {
  id: number
  organization_id: number
  lead_id: number
  title: string
  due_at: string
  extension_reason: string | null
  notes: string | null
  completed_at: string | null
  completed_by: number | null
  cancelled_at: string | null
  cancelled_by: number | null
  cancelled_reason: string | null
  created_by: number
  created_at: string
}

interface StageHistoryRow {
  id: number
  organization_id: number
  lead_id: number
  from_stage_id: number | null
  to_stage_id: number
  activity_id: number | null
  reason: string | null
  changed_by: number
  changed_at: string
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    isBlacklisted: row.is_blacklisted,
    blacklistedReason: row.blacklisted_reason,
    blacklistedAt: row.blacklisted_at,
    blacklistedBy: row.blacklisted_by,
    photoFilename: row.photo_filename,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id,
    sourceId: row.source_id,
    currentStageId: row.current_stage_id,
    ownerUserId: row.owner_user_id,
    customerId: row.customer_id,
    planId: row.plan_id,
    goal: row.goal,
    notes: row.notes,
    lostReasonId: row.lost_reason_id,
    lostAt: row.lost_at,
    lostBy: row.lost_by,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapStage(row: LeadStageRow): LeadStage {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isInitial: row.is_initial,
    isWon: row.is_won,
    isLost: row.is_lost,
    suppressFollowups: row.suppress_followups,
    active: row.active
  }
}

function mapActivity(row: ActivityRow): LeadActivity {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    typeId: row.type_id,
    note: row.note,
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapFollowup(row: FollowupRow): LeadFollowup {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    title: row.title,
    dueAt: row.due_at,
    extensionReason: row.extension_reason,
    notes: row.notes,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancelledReason: row.cancelled_reason,
    createdBy: row.created_by,
    createdAt: row.created_at
  }
}

function mapStageHistory(row: StageHistoryRow): LeadStageHistoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    fromStageId: row.from_stage_id,
    toStageId: row.to_stage_id,
    activityId: row.activity_id,
    reason: row.reason,
    changedBy: row.changed_by,
    changedAt: row.changed_at
  }
}

export const personRepo = {
  /** Identity key: (organization, normalized phone). Returns null when unknown. */
  findByPhone(organizationId: number, phone: string): Person | null {
    const row = getDrizzle()
      .select()
      .from(people)
      .where(and(eq(people.organization_id, organizationId), eq(people.phone, phone)))
      .get() as PersonRow | undefined
    return row ? mapPerson(row) : null
  },

  findById(organizationId: number, id: number): Person | null {
    const row = getDrizzle()
      .select()
      .from(people)
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .get() as PersonRow | undefined
    return row ? mapPerson(row) : null
  },

  /**
   * Case-insensitive email lookup over the org's people. Advisory by design
   * (email is duplicable; phone is the identity key): `excludePersonId` skips a
   * person's own record so the edit dialog never flags itself. Returns the
   * owner's brief so the UI can name them in a warning.
   */
  findByEmail(
    organizationId: number,
    emailLower: string,
    excludePersonId?: number
  ): {
    id: number
    fullName: string
    phone: string
    isBlacklisted: boolean
    blacklistedReason: string | null
  } | null {
    const emailMatch = sql<number>`lower(${people.email}) = ${emailLower}`
    const cond =
      excludePersonId !== undefined
        ? and(eq(people.organization_id, organizationId), emailMatch, ne(people.id, excludePersonId))
        : and(eq(people.organization_id, organizationId), emailMatch)
    const row = getDrizzle()
      .select({
        id: people.id,
        fullName: people.full_name,
        phone: people.phone,
        isBlacklisted: people.is_blacklisted,
        blacklistedReason: people.blacklisted_reason
      })
      .from(people)
      .where(cond)
      .get()
    if (!row) return null
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      isBlacklisted: row.isBlacklisted,
      blacklistedReason: row.blacklistedReason
    }
  },

  /** Basic name/phone search over the org's people, newest first. */
  search(
    organizationId: number,
    query: string,
    limit: number,
    offset: number
  ): {
    id: number
    fullName: string
    phone: string
    email: string | null
    isBlacklisted: boolean
    blacklistedReason: string | null
    photoFilename: string | null
  }[] {
    const term = `%${query}%`
    return getDrizzle()
      .select({
        id: people.id,
        fullName: people.full_name,
        phone: people.phone,
        email: people.email,
        isBlacklisted: people.is_blacklisted,
        blacklistedReason: people.blacklisted_reason,
        photoFilename: people.photo_filename
      })
      .from(people)
      .where(
        and(
          eq(people.organization_id, organizationId),
          or(like(people.full_name, term), like(people.phone, term))
        )
      )
      .orderBy(people.created_at)
      .limit(limit)
      .offset(offset)
      .all()
  },

  create(input: {
    organizationId: number
    fullName: string
    phone: string
    email: string | null
  }): Person {
    const row = getDrizzle()
      .insert(people)
      .values({
        organization_id: input.organizationId,
        full_name: input.fullName,
        phone: input.phone,
        email: input.email
      })
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  },

  /** Updates the person's contact fields. The use case owns phone-dedup checks. */
  update(
    organizationId: number,
    id: number,
    input: { fullName: string; phone: string; email: string | null }
  ): Person {
    const row = getDrizzle()
      .update(people)
      .set({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  },

  blacklist(organizationId: number, id: number, reason: string | null, byUserId: number): Person {
    const row = getDrizzle()
      .update(people)
      .set({
        is_blacklisted: true,
        blacklisted_reason: reason,
        blacklisted_at: sql`(datetime('now'))`,
        blacklisted_by: byUserId,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  },

  unblacklist(organizationId: number, id: number): Person {
    const row = getDrizzle()
      .update(people)
      .set({
        is_blacklisted: false,
        blacklisted_reason: null,
        blacklisted_at: null,
        blacklisted_by: null,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  },

  /** Updates only the photo_filename field on a person. */
  updatePhoto(organizationId: number, id: number, photoFilename: string | null): Person {
    const row = getDrizzle()
      .update(people)
      .set({
        photo_filename: photoFilename,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(people.organization_id, organizationId), eq(people.id, id)))
      .returning()
      .get()
    return mapPerson(row as unknown as PersonRow)
  }
}

export const sourceRepo = {
  findById(organizationId: number, id: number): LeadStage | null {
    const row = getDrizzle()
      .select({
        id: leadSources.id,
        organization_id: leadSources.organization_id,
        name: leadSources.name,
        sort_order: leadSources.sort_order,
        active: leadSources.active,
        is_initial: sql`0`.as('is_initial'),
        is_won: sql`0`.as('is_won'),
        is_lost: sql`0`.as('is_lost'),
        created_at: leadSources.created_at
      })
      .from(leadSources)
      .where(and(eq(leadSources.organization_id, organizationId), eq(leadSources.id, id)))
      .get() as LeadStageRow | undefined
    return row ? mapStage(row) : null
  },

  findByName(organizationId: number, name: string): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadSources.id, name: leadSources.name })
      .from(leadSources)
      .where(
        and(
          eq(leadSources.organization_id, organizationId),
          sql`lower(${leadSources.name}) = lower(${name})`
        )
      )
      .get()
    return row ?? null
  },

  search(
    organizationId: number,
    query: string,
    limit: number
  ): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({ id: leadSources.id, name: leadSources.name, active: leadSources.active })
      .from(leadSources)
      .where(
        and(
          eq(leadSources.organization_id, organizationId),
          eq(leadSources.active, true),
          like(leadSources.name, `%${query}%`)
        )
      )
      .orderBy(leadSources.sort_order)
      .limit(limit)
      .all()
  },

  create(organizationId: number, name: string): { id: number; name: string; active: boolean } {
    const maxOrder = getDrizzle()
      .select({ value: sql<number>`coalesce(max(${leadSources.sort_order}), 0)` })
      .from(leadSources)
      .where(eq(leadSources.organization_id, organizationId))
      .get()
    return getDrizzle()
      .insert(leadSources)
      .values({ organization_id: organizationId, name, sort_order: (maxOrder?.value ?? 0) + 1 })
      .returning({ id: leadSources.id, name: leadSources.name, active: leadSources.active })
      .get()
  }
}

export const lostReasonRepo = {
  findById(organizationId: number, id: number): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadLostReasons.id, name: leadLostReasons.name })
      .from(leadLostReasons)
      .where(and(eq(leadLostReasons.organization_id, organizationId), eq(leadLostReasons.id, id)))
      .get()
    return row ?? null
  },

  findAll(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({
        id: leadLostReasons.id,
        name: leadLostReasons.name,
        active: leadLostReasons.active
      })
      .from(leadLostReasons)
      .where(eq(leadLostReasons.organization_id, organizationId))
      .orderBy(leadLostReasons.sort_order)
      .all()
  }
}

export const activityTypeRepo = {
  findById(organizationId: number, id: number): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadActivityTypes.id, name: leadActivityTypes.name })
      .from(leadActivityTypes)
      .where(
        and(eq(leadActivityTypes.organization_id, organizationId), eq(leadActivityTypes.id, id))
      )
      .get()
    return row ?? null
  },

  findByName(organizationId: number, name: string): { id: number; name: string } | null {
    const row = getDrizzle()
      .select({ id: leadActivityTypes.id, name: leadActivityTypes.name })
      .from(leadActivityTypes)
      .where(
        and(eq(leadActivityTypes.organization_id, organizationId), eq(leadActivityTypes.name, name))
      )
      .get()
    return row ?? null
  },

  findAll(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({
        id: leadActivityTypes.id,
        name: leadActivityTypes.name,
        active: leadActivityTypes.active
      })
      .from(leadActivityTypes)
      .where(eq(leadActivityTypes.organization_id, organizationId))
      .orderBy(leadActivityTypes.name)
      .all()
  }
}

export const stageRepo = {
  findAll(organizationId: number): LeadStage[] {
    const rows = getDrizzle()
      .select()
      .from(leadStages)
      .where(eq(leadStages.organization_id, organizationId))
      .orderBy(leadStages.sort_order)
      .all() as unknown as LeadStageRow[]
    return rows.map(mapStage)
  },

  findById(organizationId: number, id: number): LeadStage | null {
    const row = getDrizzle()
      .select()
      .from(leadStages)
      .where(and(eq(leadStages.organization_id, organizationId), eq(leadStages.id, id)))
      .get() as LeadStageRow | undefined
    return row ? mapStage(row) : null
  },

  /** Sources list for the create form — id/name/active only. */
  findAllSources(organizationId: number): { id: number; name: string; active: boolean }[] {
    return getDrizzle()
      .select({ id: leadSources.id, name: leadSources.name, active: leadSources.active })
      .from(leadSources)
      .where(eq(leadSources.organization_id, organizationId))
      .orderBy(leadSources.sort_order)
      .all()
  }
}

/** Distinct non-empty text values used on `leads` for a free-text column. */
function distinctLeadValues(
  organizationId: number,
  column: typeof leads.goal,
  query: string,
  limit: number
): string[] {
  const builder = getDrizzle()
    .selectDistinct({ value: column })
    .from(leads)
    .where(
      and(
        eq(leads.organization_id, organizationId),
        like(column, `%${query}%`),
        sql`trim(${column}) != ''`
      )
    )
    .orderBy(column)
    .limit(limit)
  logger.debug('distinct lead values', {
    organizationId,
    column: column.name,
    query,
    limit,
    sql: builder.toSQL().sql
  })
  return builder.all().map((row) => row.value ?? '')
}

export const leadRepo = {
  getById(organizationId: number, id: number): Lead | null {
    const row = getDrizzle()
      .select()
      .from(leads)
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .get() as LeadRow | undefined
    return row ? mapLead(row) : null
  },

  /**
   * The lead currently open for a person. "Active" means its current stage is not
   * terminal (is_won/is_lost). Enforces the v1 "one active lead per person" rule.
   */
  findActiveByPersonId(organizationId: number, personId: number): Lead | null {
    const row = getDrizzle()
      .select({ l: leads })
      .from(leads)
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(
        and(
          eq(leads.organization_id, organizationId),
          eq(leads.person_id, personId),
          eq(leadStages.is_won, false),
          eq(leadStages.is_lost, false)
        )
      )
      .limit(1)
      .get()
    if (!row) return null
    const leadRow = row.l as unknown as LeadRow
    return mapLead(leadRow)
  },

  create(input: {
    organizationId: number
    personId: number
    sourceId: number
    currentStageId: number
    ownerUserId: number | null
    createdBy: number
    planId?: number | null
    goal?: string | null
    notes?: string | null
  }): Lead {
    const row = getDrizzle()
      .insert(leads)
      .values({
        organization_id: input.organizationId,
        person_id: input.personId,
        source_id: input.sourceId,
        current_stage_id: input.currentStageId,
        owner_user_id: input.ownerUserId,
        created_by: input.createdBy,
        plan_id: input.planId ?? null,
        goal: input.goal ?? null,
        notes: input.notes ?? null
      })
      .returning()
      .get()
    return mapLead(row as unknown as LeadRow)
  },

  /** Updates the lead's interest/notes fields. Stage and owner are never touched here. */
  update(
    organizationId: number,
    id: number,
    input: { sourceId: number; planId: number | null; goal: string | null; notes: string | null }
  ): void {
    getDrizzle()
      .update(leads)
      .set({
        source_id: input.sourceId,
        plan_id: input.planId,
        goal: input.goal,
        notes: input.notes,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  updateCurrentStage(organizationId: number, id: number, stageId: number): void {
    getDrizzle()
      .update(leads)
      .set({ current_stage_id: stageId, updated_at: sql`(datetime('now'))` })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  updateOwner(organizationId: number, id: number, ownerUserId: number): void {
    getDrizzle()
      .update(leads)
      .set({ owner_user_id: ownerUserId, updated_at: sql`(datetime('now'))` })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  markLost(input: {
    organizationId: number
    id: number
    stageId: number
    reasonId: number
    lostBy: number
  }): void {
    getDrizzle()
      .update(leads)
      .set({
        current_stage_id: input.stageId,
        lost_reason_id: input.reasonId,
        lost_at: sql`(datetime('now'))`,
        lost_by: input.lostBy,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(leads.organization_id, input.organizationId), eq(leads.id, input.id)))
      .run()
  },

  /**
   * Clears the lost markers when a LOST lead is won back to an open stage.
   * Only the current-state columns are reset — the `lead_stage_history` rows
   * (including the original LOST entry with its reason) stay as the audit
   * trail. Runs inside the caller's move transaction.
   */
  clearLostState(organizationId: number, id: number): void {
    getDrizzle()
      .update(leads)
      .set({
        lost_reason_id: null,
        lost_at: null,
        updated_at: sql`(datetime('now'))`
      })
      .where(and(eq(leads.organization_id, organizationId), eq(leads.id, id)))
      .run()
  },

  /**
   * Deletes leads together with their child rows. The FKs have no ON DELETE
   * CASCADE and `PRAGMA foreign_keys` is ON, so children are removed explicitly
   * in dependency order: stage history references activities, so it goes first.
   * The owning `people` row is preserved — a person can hold other leads. The
   * application use case owns the transaction boundary; this only runs inside one.
   */
  deleteByIds(organizationId: number, ids: number[]): void {
    if (ids.length === 0) return
    getDrizzle()
      .delete(leadStageHistory)
      .where(
        and(
          eq(leadStageHistory.organization_id, organizationId),
          inArray(leadStageHistory.lead_id, ids)
        )
      )
      .run()
    getDrizzle()
      .delete(leadActivities)
      .where(
        and(
          eq(leadActivities.organization_id, organizationId),
          inArray(leadActivities.lead_id, ids)
        )
      )
      .run()
    getDrizzle()
      .delete(leadFollowups)
      .where(
        and(eq(leadFollowups.organization_id, organizationId), inArray(leadFollowups.lead_id, ids))
      )
      .run()
    getDrizzle()
      .delete(leads)
      .where(and(eq(leads.organization_id, organizationId), inArray(leads.id, ids)))
      .run()
  },

  /** Leans in an `is_initial` stage — the dashboard "New Leads" card. */
  listNew(organizationId: number): { id: number; personName: string; phone: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        phone: people.phone
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_initial, true)))
      .orderBy(leads.created_at)
      .all()
  },

  /**
   * `leads:list` base rows — leads joined with person/stage/source/owner/lost
   * reason plus a filtered `COUNT(*)`. Nested arrays (activities, follow-ups,
   * stage history) are batched separately in the application layer so the list
   * stays O(1) round-trips per entity set. Filters map to indexed columns; the
   * `range` cutoff is resolved to `createdAfter` (org timezone) by the app layer.
   */
  list(input: {
    organizationId: number
    search?: string
    stageId?: number
    sourceId?: number
    ownerUserId?: number
    createdAfter?: string
    page: number
    limit: number
  }): {
    items: Array<{
      id: number
      personId: number
      personName: string
      phone: string
      email: string | null
      isBlacklisted: boolean
      photoFilename: string | null
      blacklistedReason: string | null
      sourceId: number
      sourceName: string | null
      stageId: number
      stageName: string | null
      isWon: boolean
      isLost: boolean
      ownerUserId: number | null
      ownerName: string | null
      customerId: number | null
      planId: number | null
      planName: string | null
      goal: string | null
      notes: string | null
      createdAt: string
      lostReasonId: number | null
      lostReasonName: string | null
      lostAt: string | null
    }>
    total: number
  } {
    const { organizationId, search, stageId, sourceId, ownerUserId, createdAfter } = input
    const where = and(
      eq(leads.organization_id, organizationId),
      ...(stageId !== undefined ? [eq(leads.current_stage_id, stageId)] : []),
      ...(sourceId !== undefined ? [eq(leads.source_id, sourceId)] : []),
      ...(ownerUserId !== undefined ? [eq(leads.owner_user_id, ownerUserId)] : []),
      ...(createdAfter !== undefined ? [gte(leads.created_at, createdAfter)] : []),
      ...(search
        ? [or(like(people.full_name, `%${search}%`), like(people.phone, `%${search}%`))]
        : [])
    )

    const base = getDrizzle()
      .select({
        id: leads.id,
        personId: leads.person_id,
        personName: people.full_name,
        phone: people.phone,
        email: people.email,
        isBlacklisted: people.is_blacklisted,
        photoFilename: people.photo_filename,
        blacklistedReason: people.blacklisted_reason,
        sourceId: leads.source_id,
        sourceName: leadSources.name,
        stageId: leads.current_stage_id,
        stageName: leadStages.name,
        isWon: sql<boolean>`coalesce(${leadStages.is_won}, 0)`,
        isLost: sql<boolean>`coalesce(${leadStages.is_lost}, 0)`,
        ownerUserId: leads.owner_user_id,
        ownerName: users.full_name,
        customerId: leads.customer_id,
        planId: leads.plan_id,
        planName: membershipPlans.name,
        goal: leads.goal,
        notes: leads.notes,
        createdAt: leads.created_at,
        lostReasonId: leads.lost_reason_id,
        lostReasonName: leadLostReasons.name,
        lostAt: leads.lost_at
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .leftJoin(leadSources, eq(leadSources.id, leads.source_id))
      .leftJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .leftJoin(users, eq(users.id, leads.owner_user_id))
      .leftJoin(leadLostReasons, eq(leadLostReasons.id, leads.lost_reason_id))
      .leftJoin(membershipPlans, eq(membershipPlans.id, leads.plan_id))
      .where(where)
      .orderBy(desc(leads.created_at))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit)
      .all()
      .map((row) => ({
        ...row,
        isWon: !!row.isWon,
        isLost: !!row.isLost
      }))

    const totalRow = getDrizzle()
      .select({ value: count() })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .where(where)
      .get()

    return { items: base, total: totalRow?.value ?? 0 }
  },

  /**
   * Goal autocomplete vocabulary — distinct free-text values already used on this
   * org's leads, matching the query case-insensitively. No lookup table: the
   * value itself is the option (free text, not an FK). Plan interest is no longer
   * a vocabulary — it is a real FK to `membership_plans` (planRepo.searchActive).
   */
  distinctGoals(organizationId: number, query: string, limit: number): string[] {
    return distinctLeadValues(organizationId, leads.goal, query, limit)
  },

  /** Number of leads referencing this plan — the delete guard for `deletePlan`. */
  countByPlanId(organizationId: number, planId: number): number {
    const row = getDrizzle()
      .select({ value: count() })
      .from(leads)
      .where(and(eq(leads.organization_id, organizationId), eq(leads.plan_id, planId)))
      .get()
    return row?.value ?? 0
  },

  /** In an `is_initial` stage AND zero activities — "Uncontacted Leads" (D4). */
  listUncontacted(organizationId: number): { id: number; personName: string; phone: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        phone: people.phone
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .leftJoin(leadActivities, eq(leadActivities.lead_id, leads.id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_initial, true)))
      .groupBy(leads.id)
      .having(isNull(leadActivities.id))
      .orderBy(leads.created_at)
      .all()
  },

  /** Per-stage counts for the funnel (status derived from flags, D3). */
  getFunnelCounts(organizationId: number): {
    stageId: number
    stageName: string
    isWon: boolean
    isLost: boolean
    count: number
  }[] {
    return getDrizzle()
      .select({
        stageId: leadStages.id,
        stageName: leadStages.name,
        isWon: leadStages.is_won,
        isLost: leadStages.is_lost,
        count: count()
      })
      .from(leads)
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(eq(leads.organization_id, organizationId))
      .groupBy(leads.current_stage_id)
      .orderBy(leadStages.sort_order)
      .all()
  },

  /** Leads currently in an `is_won` stage, newest activity first. */
  listRecentlyWon(organizationId: number, limit = 10): { id: number; personName: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_won, true)))
      .orderBy(leads.updated_at)
      .limit(limit)
      .all()
  },

  /** Leads currently in an `is_lost` stage, most recently lost first. */
  listRecentlyLost(organizationId: number, limit = 10): { id: number; personName: string }[] {
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .where(and(eq(leads.organization_id, organizationId), eq(leadStages.is_lost, true)))
      .orderBy(leads.updated_at)
      .limit(limit)
      .all()
  },

  /**
   * TRIAL-stage leads with a due, uncompleted follow-up — the "Trials Ending"
   * card (D18). Matches the seeded TRIAL stage by name as a pragmatic heuristic
   * (degrades to empty when the gym renames TRIAL).
   */
  listTrialsEnding(
    organizationId: number,
    withinHours = 48
  ): { id: number; personName: string; dueAt: string }[] {
    const deadline = new Date(Date.now() + withinHours * 3_600_000).toISOString()
    return getDrizzle()
      .select({
        id: leads.id,
        personName: people.full_name,
        dueAt: leadFollowups.due_at
      })
      .from(leads)
      .innerJoin(people, eq(people.id, leads.person_id))
      .innerJoin(leadStages, eq(leadStages.id, leads.current_stage_id))
      .innerJoin(leadFollowups, eq(leadFollowups.lead_id, leads.id))
      .where(
        and(
          eq(leads.organization_id, organizationId),
          eq(leadStages.name, 'TRIAL'),
          eq(leadStages.active, true),
          isNull(leadFollowups.completed_at),
          lte(leadFollowups.due_at, deadline)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all()
  }
}

export const activityRepo = {
  create(input: {
    organizationId: number
    leadId: number
    typeId: number
    note: string | null
    occurredAt: string
    createdBy: number
  }): LeadActivity {
    const row = getDrizzle()
      .insert(leadActivities)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        type_id: input.typeId,
        note: input.note,
        occurred_at: input.occurredAt,
        created_by: input.createdBy
      })
      .returning()
      .get()
    return mapActivity(row as unknown as ActivityRow)
  },

  /** Org-scoped: the activity must belong to the org (guards cross-org ids). */
  getById(organizationId: number, id: number): LeadActivity | null {
    const row = getDrizzle()
      .select()
      .from(leadActivities)
      .where(and(eq(leadActivities.organization_id, organizationId), eq(leadActivities.id, id)))
      .get() as ActivityRow | undefined
    return row ? mapActivity(row) : null
  },

  listForLead(organizationId: number, leadId: number): LeadActivity[] {
    const rows = getDrizzle()
      .select()
      .from(leadActivities)
      .where(
        and(eq(leadActivities.organization_id, organizationId), eq(leadActivities.lead_id, leadId))
      )
      .orderBy(leadActivities.occurred_at)
      .all() as unknown as ActivityRow[]
    return rows.map(mapActivity)
  },

  /** Batch read for `leads:list`: one IN query resolves type + actor names. */
  listForLeadIds(
    organizationId: number,
    leadIds: number[]
  ): Array<{
    leadId: number
    id: number
    typeId: number
    typeName: string
    note: string | null
    occurredAt: string
    createdByName: string | null
  }> {
    if (leadIds.length === 0) return []
    return getDrizzle()
      .select({
        leadId: leadActivities.lead_id,
        id: leadActivities.id,
        typeId: leadActivities.type_id,
        typeName: leadActivityTypes.name,
        note: leadActivities.note,
        occurredAt: leadActivities.occurred_at,
        createdByName: users.full_name
      })
      .from(leadActivities)
      .innerJoin(leadActivityTypes, eq(leadActivityTypes.id, leadActivities.type_id))
      .leftJoin(users, eq(users.id, leadActivities.created_by))
      .where(
        and(
          eq(leadActivities.organization_id, organizationId),
          inArray(leadActivities.lead_id, leadIds)
        )
      )
      .orderBy(leadActivities.occurred_at)
      .all()
  }
}

export const followupRepo = {
  create(input: {
    organizationId: number
    leadId: number
    title: string
    dueAt: string
    createdBy: number
  }): LeadFollowup {
    const row = getDrizzle()
      .insert(leadFollowups)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        title: input.title,
        due_at: input.dueAt,
        created_by: input.createdBy
      })
      .returning()
      .get()
    return mapFollowup(row as unknown as FollowupRow)
  },

  getById(organizationId: number, id: number): LeadFollowup | null {
    const row = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .get() as FollowupRow | undefined
    return row ? mapFollowup(row) : null
  },

  complete(organizationId: number, id: number, by: number, notes?: string | null): void {
    getDrizzle()
      .update(leadFollowups)
      .set({
        completed_at: sql`(datetime('now'))`,
        completed_by: by,
        notes: notes?.trim() ? notes.trim() : null
      })
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .run()
  },

  update(
    organizationId: number,
    id: number,
    input: { dueAt?: string; extensionReason?: string | null }
  ): void {
    const sets: Record<string, unknown> = {}
    if (input.dueAt !== undefined) sets.due_at = input.dueAt
    if (input.extensionReason !== undefined) sets.extension_reason = input.extensionReason
    if (Object.keys(sets).length === 0) return
    getDrizzle()
      .update(leadFollowups)
      .set(sets)
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .run()
  },

  cancel(organizationId: number, id: number, by: number, reason?: string): void {
    getDrizzle()
      .update(leadFollowups)
      .set({
        cancelled_at: sql`(datetime('now'))`,
        cancelled_by: by,
        cancelled_reason: reason ?? null
      })
      .where(and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.id, id)))
      .run()
  },

  /** Open follow-ups due within the given UTC window (boundary precomputed, D5). */
  listDueBetween(organizationId: number, startUtc: string, endUtc: string): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          isNull(leadFollowups.completed_at),
          gte(leadFollowups.due_at, startUtc),
          lt(leadFollowups.due_at, endUtc)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Open follow-ups due strictly before `nowUtc` — overdue. */
  listOverdueBefore(organizationId: number, nowUtc: string): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          isNull(leadFollowups.completed_at),
          lt(leadFollowups.due_at, nowUtc)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  listForLead(organizationId: number, leadId: number): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(eq(leadFollowups.organization_id, organizationId), eq(leadFollowups.lead_id, leadId))
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Pending (not completed, not cancelled) follow-ups for a lead. */
  listPendingForLead(organizationId: number, leadId: number): LeadFollowup[] {
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          eq(leadFollowups.lead_id, leadId),
          isNull(leadFollowups.completed_at),
          isNull(leadFollowups.cancelled_at)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Pending follow-ups across all leads for a person (used by blacklist). */
  listPendingForPerson(organizationId: number, personId: number): LeadFollowup[] {
    // Subquery, not a join: a star-select across a join collides `lead_followups`
    // and `leads` columns (both have `id`/`organization_id`), which silently
    // corrupts the mapped row's id. Filtering the lead set via IN keeps the
    // result to lead_followups columns only.
    const leadIds = getDrizzle()
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.person_id, personId))
    const rows = getDrizzle()
      .select()
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          inArray(leadFollowups.lead_id, leadIds),
          isNull(leadFollowups.completed_at),
          isNull(leadFollowups.cancelled_at)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all() as unknown as FollowupRow[]
    return rows.map(mapFollowup)
  },

  /** Batch read for `leads:list`: one IN query returns the follow-up cards. */
  listForLeadIds(
    organizationId: number,
    leadIds: number[]
  ): Array<{
    leadId: number
    id: number
    title: string
    dueAt: string
    extensionReason: string | null
    notes: string | null
    completedAt: string | null
    cancelledAt: string | null
  }> {
    if (leadIds.length === 0) return []
    return getDrizzle()
      .select({
        leadId: leadFollowups.lead_id,
        id: leadFollowups.id,
        title: leadFollowups.title,
        dueAt: leadFollowups.due_at,
        extensionReason: leadFollowups.extension_reason,
        notes: leadFollowups.notes,
        completedAt: leadFollowups.completed_at,
        cancelledAt: leadFollowups.cancelled_at
      })
      .from(leadFollowups)
      .where(
        and(
          eq(leadFollowups.organization_id, organizationId),
          inArray(leadFollowups.lead_id, leadIds)
        )
      )
      .orderBy(leadFollowups.due_at)
      .all()
  }
}

export const stageHistoryRepo = {
  record(input: {
    organizationId: number
    leadId: number
    fromStageId: number | null
    toStageId: number
    activityId: number | null
    reason: string | null
    changedBy: number
  }): void {
    getDrizzle()
      .insert(leadStageHistory)
      .values({
        organization_id: input.organizationId,
        lead_id: input.leadId,
        from_stage_id: input.fromStageId,
        to_stage_id: input.toStageId,
        activity_id: input.activityId,
        reason: input.reason,
        changed_by: input.changedBy
      })
      .run()
  },

  listForLead(organizationId: number, leadId: number): LeadStageHistoryEntry[] {
    const rows = getDrizzle()
      .select()
      .from(leadStageHistory)
      .where(
        and(
          eq(leadStageHistory.organization_id, organizationId),
          eq(leadStageHistory.lead_id, leadId)
        )
      )
      .orderBy(leadStageHistory.changed_at)
      .all() as unknown as StageHistoryRow[]
    return rows.map(mapStageHistory)
  },

  /** Batch read for `leads:list`: one IN query resolves stage names via aliases. */
  listForLeadIds(
    organizationId: number,
    leadIds: number[]
  ): Array<{
    leadId: number
    fromStageName: string | null
    toStageName: string
    changedAt: string
  }> {
    if (leadIds.length === 0) return []
    const fromStage = alias(leadStages, 'from_stage')
    const toStage = alias(leadStages, 'to_stage')
    return getDrizzle()
      .select({
        leadId: leadStageHistory.lead_id,
        fromStageName: fromStage.name,
        toStageName: toStage.name,
        changedAt: leadStageHistory.changed_at
      })
      .from(leadStageHistory)
      .leftJoin(fromStage, eq(fromStage.id, leadStageHistory.from_stage_id))
      .innerJoin(toStage, eq(toStage.id, leadStageHistory.to_stage_id))
      .where(
        and(
          eq(leadStageHistory.organization_id, organizationId),
          inArray(leadStageHistory.lead_id, leadIds)
        )
      )
      .orderBy(leadStageHistory.changed_at)
      .all()
  }
}
