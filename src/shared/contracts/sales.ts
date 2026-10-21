import { z } from 'zod'
import { pageRequestSchema } from './paging'

/**
 * Canonical contracts for the sales/leads IPC surface (Module 01). Input shapes
 * are Zod-validated at the IPC boundary (guidelines §15); domain rules (phone
 * format, stage legality, one-active-lead) are enforced in the application layer.
 */

export const createLeadInputSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(1).max(24),
  email: z.string().max(254).optional(),
  sourceId: z.number().int().positive(),
  planId: z.number().int().positive().nullable().optional(),
  goal: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  followup: z
    .object({
      title: z.string().min(1).max(200),
      dueAt: z.string()
    })
    .optional(),
  activity: z
    .object({
      typeId: z.number().int().positive(),
      note: z.string().max(2000).optional()
    })
    .optional()
})
export type CreateLeadInput = z.infer<typeof createLeadInputSchema>

export const createdLeadSchema = z.object({
  leadId: z.number().int().positive(),
  personId: z.number().int().positive()
})
export type CreatedLead = z.infer<typeof createdLeadSchema>

/**
 * Edits a lead's contact + interest fields. The same shape as create (the person
 * fields live on `people`, the interest fields on `leads`). Ownership (owner or
 * super) is enforced in the application layer, never in this shape.
 */
export const editLeadInputSchema = z.object({
  leadId: z.number().int().positive(),
  fullName: z.string().min(1).max(120),
  phone: z.string().min(1).max(24),
  email: z.string().max(254).optional(),
  sourceId: z.number().int().positive(),
  planId: z.number().int().positive().nullable().optional(),
  goal: z.string().max(200).optional(),
  notes: z.string().max(2000).optional()
})
export type EditLeadInput = z.infer<typeof editLeadInputSchema>

export const moveLeadStageInputSchema = z.object({
  leadId: z.number().int().positive(),
  targetStageId: z.number().int().positive(),
  expectedStageId: z.number().int().positive(),
  activityId: z.number().int().positive()
})
export type MoveLeadStageInput = z.infer<typeof moveLeadStageInputSchema>

export const markLeadLostInputSchema = z.object({
  leadId: z.number().int().positive(),
  lostReasonId: z.number().int().positive()
})
export type MarkLeadLostInput = z.infer<typeof markLeadLostInputSchema>

export const scheduleFollowUpInputSchema = z.object({
  leadId: z.number().int().positive(),
  title: z.string().min(1).max(200),
  dueAt: z.string()
})
export type ScheduleFollowUpInput = z.infer<typeof scheduleFollowUpInputSchema>

export const completeFollowUpInputSchema = z.object({
  followupId: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
  activity: z
    .object({
      typeId: z.number().int().positive(),
      note: z.string().max(2000).optional()
    })
    .optional(),
  /**
   * Optional stage move completed in the same atomic transaction as the
   * completion. `expectedStageId` is the stage the renderer believes the lead
   * is on — a mismatch (concurrent change) aborts with a ConflictError (D17).
   */
  stageChange: z
    .object({
      targetStageId: z.number().int().positive(),
      expectedStageId: z.number().int().positive()
    })
    .optional()
})
export type CompleteFollowUpInput = z.infer<typeof completeFollowUpInputSchema>

/**
 * Bulk "mark done" for the follow-ups queue's selection toolbar. Completes every
 * follow-up in one atomic transaction; when `stageChange` is given, each lead
 * (whose stage allows it) is moved too, with a NOTE activity auto-recorded per
 * lead. Already-completed follow-ups are skipped silently (idempotent). There is
 * no `expectedStageId` — the backend validates each lead's live current stage
 * inside the transaction, mirroring `bulkMoveLeadStage`.
 */
export const bulkCompleteFollowUpsInputSchema = z.object({
  followUpIds: z.array(z.number().int().positive()).min(1).max(100),
  stageChange: z
    .object({
      targetStageId: z.number().int().positive()
    })
    .optional()
})
export type BulkCompleteFollowUpsInput = z.infer<typeof bulkCompleteFollowUpsInputSchema>

export const bulkCompleteFollowUpsResultSchema = z.object({
  completed: z.number().int().nonnegative()
})
export type BulkCompleteFollowUpsResult = z.infer<typeof bulkCompleteFollowUpsResultSchema>

export const updateFollowUpInputSchema = z.object({
  followupId: z.number().int().positive(),
  dueAt: z.string(),
  extensionReason: z.string().max(500).optional()
})
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpInputSchema>

export const cancelFollowUpInputSchema = z.object({
  followupId: z.number().int().positive(),
  reason: z.string().max(500).optional()
})
export type CancelFollowUpInput = z.infer<typeof cancelFollowUpInputSchema>

export const assignLeadInputSchema = z.object({
  leadId: z.number().int().positive(),
  ownerUserId: z.number().int().positive()
})
export type AssignLeadInput = z.infer<typeof assignLeadInputSchema>

/**
 * Bulk delete. Ids are org-scoped and validated by the application layer; the
 * renderer never sends cross-org ids because it only selects visible rows.
 */
export const deleteLeadsInputSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(200)
})
export type DeleteLeadsInput = z.infer<typeof deleteLeadsInputSchema>

/**
 * Bulk stage move. Every selected lead is validated by the stage machine and
 * moved with a NOTE activity recorded per lead (the strict-move rule), inside
 * one transaction. Leads already at the target stage are skipped.
 */
export const bulkMoveLeadStageInputSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(200),
  targetStageId: z.number().int().positive(),
  note: z.string().trim().max(500).optional()
})
export type BulkMoveLeadStageInput = z.infer<typeof bulkMoveLeadStageInputSchema>

export const bulkMoveLeadStageResultSchema = z.object({
  moved: z.number().int().nonnegative()
})
export type BulkMoveLeadStageResult = z.infer<typeof bulkMoveLeadStageResultSchema>

/**
 * Bulk follow-up scheduling for the table's selection toolbar. One follow-up
 * per selected lead, inside a single transaction; all leads are validated
 * before anything is written (all-or-nothing).
 */
export const bulkScheduleFollowUpInputSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(200),
  title: z.string().min(1).max(200),
  dueAt: z.string()
})
export type BulkScheduleFollowUpInput = z.infer<typeof bulkScheduleFollowUpInputSchema>

export const bulkScheduleFollowUpResultSchema = z.object({
  scheduled: z.number().int().nonnegative()
})
export type BulkScheduleFollowUpResult = z.infer<typeof bulkScheduleFollowUpResultSchema>

/**
 * Bulk activity logging for the table's selection toolbar. One activity per
 * selected lead, inside a single transaction; all leads are validated before
 * anything is written (all-or-nothing).
 */
export const bulkRecordActivityInputSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(200),
  typeId: z.number().int().positive(),
  note: z.string().max(2000).optional(),
  occurredAt: z.string()
})
export type BulkRecordActivityInput = z.infer<typeof bulkRecordActivityInputSchema>

export const bulkRecordActivityResultSchema = z.object({
  recorded: z.number().int().nonnegative()
})
export type BulkRecordActivityResult = z.infer<typeof bulkRecordActivityResultSchema>

export const recordLeadActivityInputSchema = z.object({
  leadId: z.number().int().positive(),
  typeId: z.number().int().positive(),
  note: z.string().max(2000).optional(),
  occurredAt: z.string()
})
export type RecordLeadActivityInput = z.infer<typeof recordLeadActivityInputSchema>

export const recordedActivitySchema = z.object({
  activityId: z.number().int().positive()
})
export type RecordedActivity = z.infer<typeof recordedActivitySchema>

export const leadIdRequestSchema = z.object({ leadId: z.number().int().positive() })
export type LeadIdRequest = z.infer<typeof leadIdRequestSchema>

export const leadDetailsSchema = z.object({
  leadId: z.number().int().positive(),
  personName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  sourceName: z.string(),
  stageName: z.string(),
  status: z.enum(['OPEN', 'WON', 'LOST']),
  ownerName: z.string().nullable(),
  createdAt: z.string()
})
export type LeadDetails = z.infer<typeof leadDetailsSchema>

export const leadTimelineEntrySchema = z.object({
  kind: z.enum(['activity', 'stage', 'followup']),
  at: z.string(),
  label: z.string()
})
export type LeadTimelineEntry = z.infer<typeof leadTimelineEntrySchema>

export const funnelCountsSchema = z.array(
  z.object({
    stageId: z.number().int().positive(),
    stageName: z.string(),
    isWon: z.boolean(),
    isLost: z.boolean(),
    count: z.number().int()
  })
)
export type FunnelCounts = z.infer<typeof funnelCountsSchema>

/** A configurable lead source (marketing channel) row. */
export const leadSourceRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  active: z.boolean()
})
export type LeadSourceRow = z.infer<typeof leadSourceRowSchema>

export const leadSourceSearchRequestSchema = z.object({
  query: z.string().max(120)
})
export type LeadSourceSearchRequest = z.infer<typeof leadSourceSearchRequestSchema>

export const createLeadSourceInputSchema = z.object({
  name: z.string().min(1).max(120)
})
export type CreateLeadSourceInput = z.infer<typeof createLeadSourceInputSchema>

/**
 * A free-text lead vocabulary option (plan interest / goal). The value itself is
 * the identity: `id` and `label` carry the same trimmed text, because these
 * fields store the text on `leads`, not a foreign key.
 */
export const leadTextOptionRowSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200)
})
export type LeadTextOptionRow = z.infer<typeof leadTextOptionRowSchema>

/** Search request for a free-text lead vocabulary (goals). */
export const leadVocabularySearchRequestSchema = z.object({
  query: z.string().max(120)
})
export type LeadVocabularySearchRequest = z.infer<typeof leadVocabularySearchRequestSchema>

/**
 * A membership-plan option for the lead form's plan picker. Unlike the free-text
 * vocabularies, the identity is the numeric plan id — the value is a real FK to
 * `membership_plans` (Module 03).
 */
export const planOptionRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(120)
})
export type PlanOptionRow = z.infer<typeof planOptionRowSchema>

export const planSearchRequestSchema = z.object({
  query: z.string().max(120)
})
export type PlanSearchRequest = z.infer<typeof planSearchRequestSchema>

/** The org's sales reference data for forms (sources/stages/reasons/types). */
export const referenceDataSchema = z.object({
  sources: z.array(leadSourceRowSchema),
  stages: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      sortOrder: z.number().int(),
      isInitial: z.boolean(),
      isWon: z.boolean(),
      isLost: z.boolean(),
      active: z.boolean()
    })
  ),
  lostReasons: z.array(
    z.object({ id: z.number().int().positive(), name: z.string(), active: z.boolean() })
  ),
  activityTypes: z.array(
    z.object({ id: z.number().int().positive(), name: z.string(), active: z.boolean() })
  )
})
export type ReferenceData = z.infer<typeof referenceDataSchema>

export const referenceDataRequestSchema = z.object({})
export type ReferenceDataRequest = z.infer<typeof referenceDataRequestSchema>

/**
 * `leads:list` — the pipeline read model. Each row carries the nested arrays the
 * renderer already consumes (timeline activities, follow-ups, stage history), so
 * the whole Leads feature renders from a single query. Optional filters map to
 * indexed columns; `range` uses the org's local day boundaries via the
 * application layer.
 */
export const leadListRequestSchema = pageRequestSchema.extend({
  search: z.string().max(120).optional(),
  stageId: z.number().int().positive().optional(),
  sourceId: z.number().int().positive().optional(),
  ownerUserId: z.number().int().positive().optional(),
  range: z.enum(['today', 'week', 'month', 'all']).optional()
})
export type LeadListRequest = z.infer<typeof leadListRequestSchema>

export const leadListActivitySchema = z.object({
  id: z.number().int().positive(),
  typeId: z.number().int().positive(),
  typeName: z.string(),
  note: z.string().nullable(),
  occurredAt: z.string(),
  createdByName: z.string().nullable()
})
export type LeadListActivity = z.infer<typeof leadListActivitySchema>

export const leadListFollowUpSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  dueAt: z.string(),
  extensionReason: z.string().nullable(),
  notes: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable()
})
export type LeadListFollowUp = z.infer<typeof leadListFollowUpSchema>

export const leadListStageHistorySchema = z.object({
  fromStageName: z.string().nullable(),
  toStageName: z.string(),
  changedAt: z.string()
})
export type LeadListStageHistory = z.infer<typeof leadListStageHistorySchema>

export const leadListRowSchema = z.object({
  id: z.number().int().positive(),
  personId: z.number().int().positive(),
  personName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  isBlacklisted: z.boolean(),
  blacklistedReason: z.string().nullable(),
  photoFilename: z.string().nullable(),
  sourceId: z.number().int().positive(),
  sourceName: z.string().nullable(),
  stageId: z.number().int().positive(),
  stageName: z.string().nullable(),
  isWon: z.boolean(),
  isLost: z.boolean(),
  ownerUserId: z.number().int().positive().nullable(),
  ownerName: z.string().nullable(),
  customerId: z.number().int().positive().nullable(),
  planId: z.number().int().positive().nullable(),
  planName: z.string().nullable(),
  goal: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  lostReasonId: z.number().int().positive().nullable(),
  lostReasonName: z.string().nullable(),
  lostAt: z.string().nullable(),
  activities: z.array(leadListActivitySchema),
  followUps: z.array(leadListFollowUpSchema),
  stageHistory: z.array(leadListStageHistorySchema)
})
export type LeadListRow = z.infer<typeof leadListRowSchema>

export const leadListResponseSchema = z.object({
  items: z.array(leadListRowSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean()
})
export type LeadListResponse = z.infer<typeof leadListResponseSchema>

export const peopleListSchema = z.array(
  z.object({
    id: z.number().int().positive(),
    fullName: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    isBlacklisted: z.boolean(),
    blacklistedReason: z.string().nullable(),
    photoFilename: z.string().nullable()
  })
)
export type PeopleList = z.infer<typeof peopleListSchema>

export const peopleSearchSchema = pageRequestSchema.extend({
  query: z.string().max(120)
})
export type PeopleSearch = z.infer<typeof peopleSearchSchema>

/**
 * Reactive duplicate probe for the lead forms. The renderer calls this while
 * the user types (debounced) so "this person already exists" is caught client
 * side instead of on submit. `excludePersonId` is used by the edit dialog so a
 * person's own record never flags itself.
 */
export const checkLeadPersonInputSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(1).max(24),
  email: z.string().max(254).optional(),
  excludePersonId: z.number().int().positive().optional()
})
export type CheckLeadPersonInput = z.infer<typeof checkLeadPersonInputSchema>

export const personBriefSchema = z.object({
  id: z.number().int().positive(),
  fullName: z.string(),
  phone: z.string(),
  isBlacklisted: z.boolean(),
  blacklistedReason: z.string().nullable()
})
export type PersonBrief = z.infer<typeof personBriefSchema>

export const leadPersonAvailabilitySchema = z.object({
  /* True when an org person already owns this phone (excluding `excludePersonId`). */
  phoneTaken: z.boolean(),
  /* True when that person's name matches the entered name (the unique-together key). */
  sameNamedPerson: z.boolean(),
  matchedPerson: personBriefSchema.nullable(),
  /* Advisory only: another person (excluding the matched/excluded one) holds this email. */
  emailTaken: z.boolean(),
  emailOwnerName: z.string().nullable()
})
export type LeadPersonAvailability = z.infer<typeof leadPersonAvailabilitySchema>
