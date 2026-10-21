import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import {
  activityRepo,
  activityTypeRepo,
  followupRepo,
  leadRepo,
  lostReasonRepo,
  personRepo,
  sourceRepo,
  stageHistoryRepo,
  stageRepo
} from '../repositories/sales'
import { userRepo } from '../repositories/identity'
import { planRepo } from '../repositories/catalog'
import { logger } from '../lib/logger'
import { IndianMobileNumber } from '../domain/phone'
import {
  LeadStageMachine,
  localDayUtcRange,
  deriveLeadStatus,
  samePersonName
} from '../domain/lead'
import { orgTimezone } from './organization'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors'
import { assertPersonAllowed } from './blacklist'
import { PERMISSIONS } from '../db/permissions'
import type {
  AssignLeadInput,
  BulkCompleteFollowUpsInput,
  BulkCompleteFollowUpsResult,
  BulkMoveLeadStageInput,
  BulkMoveLeadStageResult,
  BulkRecordActivityInput,
  BulkRecordActivityResult,
  BulkScheduleFollowUpInput,
  BulkScheduleFollowUpResult,
  CancelFollowUpInput,
  CheckLeadPersonInput,
  CompleteFollowUpInput,
  CreateLeadInput,
  CreateLeadSourceInput,
  CreatedLead,
  DeleteLeadsInput,
  EditLeadInput,
  FunnelCounts,
  LeadIdRequest,
  LeadListRequest,
  LeadListResponse,
  LeadPersonAvailability,
  LeadSourceRow,
  LeadSourceSearchRequest,
  LeadTextOptionRow,
  LeadVocabularySearchRequest,
  MarkLeadLostInput,
  MoveLeadStageInput,
  PeopleList,
  PlanOptionRow,
  PlanSearchRequest,
  RecordedActivity,
  RecordLeadActivityInput,
  ReferenceData,
  ScheduleFollowUpInput,
  UpdateFollowUpInput
} from '../../shared/contracts/sales'

/**
 * Module 01 application use cases and queries. Each Command gates on a permission,
 * derives the org/user from the session, and owns one `withTransaction` boundary.
 */

const OWNER_CHANGE_TYPE = 'OWNER_CHANGE'

/** Human-readable cancellation reasons for stages that suppress follow-ups. */
const SUPPRESS_FOLLOWUP_REASONS: Record<string, string> = {
  DO_NOT_DISTURB: 'Follow-up cancelled — lead moved to Do Not Disturb',
  NOT_INTERESTED: 'Follow-up cancelled — lead moved to Not Interested'
}

/** Auto-NOTE text for a completion that also moves the lead (strict-move rule). */
function completedFollowupNote(targetName: string): string {
  return `Followup completed — moved to ${targetName}`
}

function stageMachineFor(organizationId: number): LeadStageMachine {
  return new LeadStageMachine(stageRepo.findAll(organizationId))
}

/** The plan a lead is interested in must exist in the org's catalog (Module 03). */
function assertPlanExists(organizationId: number, planId: number | null | undefined): void {
  if (planId === null || planId === undefined) return
  if (!planRepo.getById(organizationId, planId)) {
    throw new NotFoundError('Plan not found')
  }
}

/** Creates the person (if unknown) and a lead at the initial stage, atomically. */
export function createLead(input: CreateLeadInput): CreatedLead {
  requirePermission(PERMISSIONS.LEAD_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const phone = IndianMobileNumber.parse(input.phone)
  const machine = stageMachineFor(organizationId)
  const initialStage = machine.initialStage()

  if (!sourceRepo.findById(organizationId, input.sourceId)) {
    throw new NotFoundError('Lead source not found')
  }

  assertPlanExists(organizationId, input.planId)

  return withTransaction(() => {
    let person = personRepo.findByPhone(organizationId, phone.value)
    if (!person) {
      person = personRepo.create({
        organizationId,
        fullName: input.fullName.trim(),
        phone: phone.value,
        email: input.email?.trim().toLowerCase() || null
      })
    }

    assertPersonAllowed(organizationId, person.id, 'create a lead')

    if (leadRepo.findActiveByPersonId(organizationId, person.id)) {
      throw new ConflictError('This person already has an active lead')
    }

    const lead = leadRepo.create({
      organizationId,
      personId: person.id,
      sourceId: input.sourceId,
      currentStageId: initialStage.id,
      ownerUserId: userId,
      createdBy: userId,
      planId: input.planId ?? null,
      goal: input.goal?.trim() || null,
      notes: input.notes?.trim() || null
    })

    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: null,
      toStageId: initialStage.id,
      activityId: null,
      reason: null,
      changedBy: userId
    })

    // Follow-up: use provided or auto-create "Post enquiry followup" after 2 days
    if (input.followup) {
      const due = new Date(input.followup.dueAt)
      if (Number.isNaN(due.getTime()))
        throw new ValidationError('followup.dueAt must be a valid date')
      if (due.getTime() <= Date.now()) {
        throw new ValidationError('Follow-up due date must be in the future')
      }
      followupRepo.create({
        organizationId,
        leadId: lead.id,
        title: input.followup.title.trim(),
        dueAt: due.toISOString(),
        createdBy: userId
      })
    } else {
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      followupRepo.create({
        organizationId,
        leadId: lead.id,
        title: 'Post enquiry followup',
        dueAt: twoDaysFromNow.toISOString(),
        createdBy: userId
      })
    }

    // Activity: log if provided
    if (input.activity) {
      const type = activityTypeRepo.findById(organizationId, input.activity.typeId)
      if (!type) throw new NotFoundError('Activity type not found')
      activityRepo.create({
        organizationId,
        leadId: lead.id,
        typeId: type.id,
        note: input.activity.note?.trim() || null,
        occurredAt: new Date().toISOString(),
        createdBy: userId
      })
    }

    return { leadId: lead.id, personId: person.id }
  })
}

/**
 * Edits a lead's contact and interest fields. Only the lead's owner or a super
 * role (Owner/Admin) may edit — every other role is denied even when it holds
 * `lead.edit`, mirroring the "edit is owned" model (Module 15). The phone change
 * dedupes like create: a number already used by a different person in the org is
 * a conflict. A NOTE activity records the change on the timeline (Module 01
 * audit rule: history is retained, never overwritten).
 */
export function editLead(input: EditLeadInput): void {
  requirePermission(PERMISSIONS.LEAD_EDIT)
  const session = requireSession()
  const organizationId = session.organizationId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')

  if (!session.isSuper && lead.ownerUserId !== session.userId) {
    throw new ForbiddenError(PERMISSIONS.LEAD_EDIT)
  }

  const phone = IndianMobileNumber.parse(input.phone)
  if (!sourceRepo.findById(organizationId, input.sourceId)) {
    throw new NotFoundError('Lead source not found')
  }

  assertPlanExists(organizationId, input.planId)

  const person = personRepo.findById(organizationId, lead.personId)
  if (!person) throw new NotFoundError('Person not found')
  assertPersonAllowed(organizationId, person.id, 'edit this lead')

  const noteType = activityTypeRepo.findByName(organizationId, 'NOTE')
  if (!noteType) throw new NotFoundError('NOTE activity type is not configured')

  withTransaction(() => {
    const existing = personRepo.findByPhone(organizationId, phone.value)
    if (existing && existing.id !== person.id) {
      throw new ConflictError('Another person already uses this phone number')
    }
    personRepo.update(organizationId, person.id, {
      fullName: input.fullName.trim(),
      phone: phone.value,
      email: input.email?.trim().toLowerCase() || null
    })
    leadRepo.update(organizationId, lead.id, {
      sourceId: input.sourceId,
      planId: input.planId ?? null,
      goal: input.goal?.trim() || null,
      notes: input.notes?.trim() || null
    })
    activityRepo.create({
      organizationId,
      leadId: lead.id,
      typeId: noteType.id,
      note: 'Lead details updated',
      occurredAt: new Date().toISOString(),
      createdBy: session.userId
    })
  })
}

/**
 * Moves a lead to any active non-terminal stage, guarded by the stage machine.
 * The caller must pass the stage it believes the lead is on (`expectedStageId`);
 * a mismatch means a concurrent change happened (D17).
 *
 * When moving TO a stage with `suppressFollowups=true`, all pending follow-ups
 * for the lead are cancelled (reason: "Stage changed to [stage name]").
 */
export function moveLeadStage(input: MoveLeadStageInput): void {
  requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = stageMachineFor(organizationId)
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, lead.personId, 'move this lead')

  const current = stageRepo.findById(organizationId, lead.currentStageId)
  if (!current) throw new NotFoundError('Current stage not found')
  const target = stageRepo.findById(organizationId, input.targetStageId)
  if (!current) throw new NotFoundError('Current stage not found')
  if (!target) throw new NotFoundError('Target stage not found')

  if (lead.currentStageId !== input.expectedStageId) {
    throw new ConflictError('Lead changed concurrently; refresh and retry')
  }

  const activity = activityRepo.getById(organizationId, input.activityId)
  if (!activity || activity.leadId !== lead.id) {
    throw new NotFoundError('Activity not found for this lead')
  }

  machine.assertMoveAllowed(current, target, true)

  withTransaction(() => {
    leadRepo.updateCurrentStage(organizationId, lead.id, target.id)
    if (current.isLost) leadRepo.clearLostState(organizationId, lead.id)
    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: current.id,
      toStageId: target.id,
      activityId: activity.id,
      reason: null,
      changedBy: userId
    })

    // Cancel pending follow-ups when moving to a stage that suppresses them
    if (target.suppressFollowups) {
      const pendingFollowups = followupRepo.listPendingForLead(organizationId, lead.id)
      const reason =
        SUPPRESS_FOLLOWUP_REASONS[target.name] ??
        `Follow-up cancelled — lead moved to ${target.name}`
      for (const fu of pendingFollowups) {
        followupRepo.cancel(organizationId, fu.id, userId, reason)
      }
    }
  })
}

/**
 * Bulk stage move for the table's selection toolbar. Every selected lead is
 * validated by the stage machine up front (all-or-nothing), then moved inside
 * one transaction. The strict-move rule demands a real activity per lead, so a
 * NOTE activity is recorded for each — the note names the bulk action and its
 * target. Leads already at the target stage are skipped (a move is a no-op).
 *
 * When moving TO a stage with `suppressFollowups=true`, all pending follow-ups
 * for each lead are cancelled (reason: "Stage changed to [stage name]").
 */
export function bulkMoveLeadStage(input: BulkMoveLeadStageInput): BulkMoveLeadStageResult {
  requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = stageMachineFor(organizationId)
  const target = stageRepo.findById(organizationId, input.targetStageId)
  if (!target) throw new NotFoundError('Target stage not found')

  const noteType = activityTypeRepo.findByName(organizationId, 'NOTE')
  if (!noteType) throw new NotFoundError('NOTE activity type is not configured')

  const leads = input.leadIds.map((id) => {
    const lead = leadRepo.getById(organizationId, id)
    if (!lead) throw new NotFoundError('Lead not found')
    return lead
  })

  // Validate every move before mutating anything, so a bad lead aborts the batch.
  for (const lead of leads) {
    if (lead.currentStageId === target.id) continue
    assertPersonAllowed(organizationId, lead.personId, 'move this lead')
    const current = stageRepo.findById(organizationId, lead.currentStageId)
    if (!current) throw new NotFoundError('Current stage not found')
    machine.assertMoveAllowed(current, target, true)
  }

  return withTransaction(() => {
    let moved = 0
    for (const lead of leads) {
      if (lead.currentStageId === target.id) continue
      const current = stageRepo.findById(organizationId, lead.currentStageId)!
      const activity = activityRepo.create({
        organizationId,
        leadId: lead.id,
        typeId: noteType.id,
        note: input.note?.trim() || `Bulk move to ${target.name}`,
        occurredAt: new Date().toISOString(),
        createdBy: userId
      })
      leadRepo.updateCurrentStage(organizationId, lead.id, target.id)
      if (current.isLost) leadRepo.clearLostState(organizationId, lead.id)
      stageHistoryRepo.record({
        organizationId,
        leadId: lead.id,
        fromStageId: current.id,
        toStageId: target.id,
        activityId: activity.id,
        reason: null,
        changedBy: userId
      })

      // Cancel pending follow-ups when moving to a stage that suppresses them
      if (target.suppressFollowups) {
        const pendingFollowups = followupRepo.listPendingForLead(organizationId, lead.id)
        const reason =
          SUPPRESS_FOLLOWUP_REASONS[target.name] ??
          `Follow-up cancelled — lead moved to ${target.name}`
        for (const fu of pendingFollowups) {
          followupRepo.cancel(organizationId, fu.id, userId, reason)
        }
      }

      moved++
    }
    return { moved }
  })
}

/**
 * Deletes leads and their history (activities, follow-ups, stage moves) in one
 * transaction. The person row is deliberately preserved: a person can hold
 * other leads, so a deleted lead never orphans shared contact data.
 */
export function deleteLeads(input: DeleteLeadsInput): void {
  requirePermission(PERMISSIONS.LEAD_DELETE)
  const organizationId = currentOrganizationId()

  for (const id of input.leadIds) {
    const lead = leadRepo.getById(organizationId, id)
    if (!lead) {
      throw new NotFoundError('Lead not found')
    }
    assertPersonAllowed(organizationId, lead.personId, 'delete this lead')
  }

  withTransaction(() => {
    leadRepo.deleteByIds(organizationId, input.leadIds)
  })
}

/** Records an activity on a lead. Never mutates the stage (D10). */
export function recordLeadActivity(input: RecordLeadActivityInput): RecordedActivity {
  requirePermission(PERMISSIONS.LEAD_RECORD_ACTIVITY)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, lead.personId, 'log an activity')

  const type = activityTypeRepo.findById(organizationId, input.typeId)
  if (!type) throw new NotFoundError('Activity type not found')

  const activity = activityRepo.create({
    organizationId,
    leadId: lead.id,
    typeId: type.id,
    note: input.note?.trim() || null,
    occurredAt: input.occurredAt,
    createdBy: userId
  })
  return { activityId: activity.id }
}

/**
 * Bulk follow-up scheduling for the selection toolbar. Every lead is validated
 * up front (all-or-nothing), then one follow-up is created per lead inside a
 * single transaction. The due date must be in the future, as in the single flow.
 *
 * Leads in stages with `suppressFollowups=true` are skipped (no follow-up created).
 */
export function bulkScheduleFollowUp(input: BulkScheduleFollowUpInput): BulkScheduleFollowUpResult {
  requirePermission(PERMISSIONS.FOLLOWUP_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw new ValidationError('dueAt must be a valid date')
  if (due.getTime() <= Date.now()) {
    throw new ValidationError('Follow-up due date must be in the future')
  }

  const leads = input.leadIds.map((id) => {
    const lead = leadRepo.getById(organizationId, id)
    if (!lead) throw new NotFoundError('Lead not found')
    assertPersonAllowed(organizationId, lead.personId, 'schedule a follow-up')
    return lead
  })

  return withTransaction(() => {
    let scheduled = 0
    for (const lead of leads) {
      const stage = stageRepo.findById(organizationId, lead.currentStageId)
      if (stage?.suppressFollowups) continue

      followupRepo.create({
        organizationId,
        leadId: lead.id,
        title: input.title.trim(),
        dueAt: due.toISOString(),
        createdBy: userId
      })
      scheduled++
    }
    return { scheduled }
  })
}

/**
 * Bulk activity logging for the selection toolbar. Every lead is validated up
 * front (all-or-nothing), then one activity is recorded per lead inside a
 * single transaction. Never mutates the stage (D10), like the single flow.
 */
export function bulkRecordActivity(input: BulkRecordActivityInput): BulkRecordActivityResult {
  requirePermission(PERMISSIONS.LEAD_RECORD_ACTIVITY)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const type = activityTypeRepo.findById(organizationId, input.typeId)
  if (!type) throw new NotFoundError('Activity type not found')

  for (const id of input.leadIds) {
    const lead = leadRepo.getById(organizationId, id)
    if (!lead) throw new NotFoundError('Lead not found')
    assertPersonAllowed(organizationId, lead.personId, 'log an activity')
  }

  return withTransaction(() => {
    let recorded = 0
    for (const id of input.leadIds) {
      activityRepo.create({
        organizationId,
        leadId: id,
        typeId: type.id,
        note: input.note?.trim() || null,
        occurredAt: input.occurredAt,
        createdBy: userId
      })
      recorded++
    }
    return { recorded }
  })
}

/** Reassigns the owner, recording an OWNER_CHANGE activity (D15). */
export function assignLead(input: AssignLeadInput): void {
  requirePermission(PERMISSIONS.LEAD_ASSIGN)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, lead.personId, 'reassign this lead')
  if (lead.ownerUserId === input.ownerUserId) return

  const target = userRepo.findById(input.ownerUserId)
  if (!target) throw new NotFoundError('Owner user not found')

  const ownerChangeType = activityTypeRepo.findByName(organizationId, OWNER_CHANGE_TYPE)
  if (!ownerChangeType) throw new NotFoundError('OWNER_CHANGE activity type is not configured')

  withTransaction(() => {
    leadRepo.updateOwner(organizationId, lead.id, input.ownerUserId)
    activityRepo.create({
      organizationId,
      leadId: lead.id,
      typeId: ownerChangeType.id,
      note: `Ownership changed from user ${lead.ownerUserId ?? 'none'} to ${input.ownerUserId}`,
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
  })
}

/** Marks a lead lost with a mandatory reason (D8). LOST stays re-openable — a later
 * stage move wins the lead back and clears the lost markers (history preserved). */
export function markLeadLost(input: MarkLeadLostInput): void {
  requirePermission(PERMISSIONS.LEAD_MARK_LOST)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const machine = stageMachineFor(organizationId)
  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, lead.personId, 'mark this lead lost')

  const current = stageRepo.findById(organizationId, lead.currentStageId)
  if (!current) throw new NotFoundError('Current stage not found')

  const reason = lostReasonRepo.findById(organizationId, input.lostReasonId)
  if (!reason) throw new NotFoundError('Lost reason not found')

  machine.assertCanMarkLost(current)
  const lostStage = machine.terminalStage('isLost')

  withTransaction(() => {
    leadRepo.markLost({
      organizationId,
      id: lead.id,
      stageId: lostStage.id,
      reasonId: reason.id,
      lostBy: userId
    })
    stageHistoryRepo.record({
      organizationId,
      leadId: lead.id,
      fromStageId: current.id,
      toStageId: lostStage.id,
      activityId: null,
      reason: reason.name,
      changedBy: userId
    })
  })
}

/**
 * Schedules a follow-up. The due date must be in the future.
 * Refuses to create a follow-up if the lead is in a stage with suppressFollowups=true.
 */
export function scheduleFollowUp(input: ScheduleFollowUpInput): { followupId: number } {
  requirePermission(PERMISSIONS.FOLLOWUP_CREATE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, lead.personId, 'schedule a follow-up')

  const currentStage = stageRepo.findById(organizationId, lead.currentStageId)
  if (!currentStage) throw new NotFoundError('Lead stage not found')

  if (currentStage.suppressFollowups) {
    throw new ValidationError(
      `Cannot schedule follow-up for a lead in "${currentStage.name}" stage`
    )
  }

  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw new ValidationError('dueAt must be a valid date')
  if (due.getTime() <= Date.now()) {
    throw new ValidationError('Follow-up due date must be in the future')
  }

  const followup = withTransaction(() =>
    followupRepo.create({
      organizationId,
      leadId: lead.id,
      title: input.title.trim(),
      dueAt: due.toISOString(),
      createdBy: userId
    })
  )
  return { followupId: followup.id }
}

/**
 * Completes a follow-up. Idempotent: completing an already-done one is a no-op.
 * Optionally moves the lead's stage in the SAME transaction — the strict-move
 * rule (every stage change must link a real activity) is satisfied by the
 * activity recorded alongside the completion; when none was supplied, a NOTE
 * activity is recorded automatically so the move stays auditable. The stage
 * change requires `lead.update_stage`, which is checked before any write.
 */
export function completeFollowUp(input: CompleteFollowUpInput): void {
  requirePermission(PERMISSIONS.FOLLOWUP_COMPLETE)
  if (input.stageChange) requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const followup = followupRepo.getById(organizationId, input.followupId)
  if (!followup) throw new NotFoundError('Follow-up not found')
  if (followup.completedAt) return

  const completedLead = leadRepo.getById(organizationId, followup.leadId)
  if (!completedLead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, completedLead.personId, 'complete a follow-up')

  const machine = stageMachineFor(organizationId)

  const change = input.stageChange
    ? (() => {
        const lead = leadRepo.getById(organizationId, followup.leadId)
        if (!lead) throw new NotFoundError('Lead not found')
        const current = stageRepo.findById(organizationId, lead.currentStageId)
        if (!current) throw new NotFoundError('Current stage not found')
        const target = stageRepo.findById(organizationId, input.stageChange!.targetStageId)
        if (!target) throw new NotFoundError('Target stage not found')
        if (lead.currentStageId !== input.stageChange!.expectedStageId) {
          throw new ConflictError('Lead changed concurrently; refresh and retry')
        }
        return { lead, current, target }
      })()
    : null

  withTransaction(() => {
    followupRepo.complete(organizationId, followup.id, userId, input.notes)

    let activityId: number | null = null
    if (input.activity) {
      const type = activityTypeRepo.findById(organizationId, input.activity.typeId)
      if (!type) throw new NotFoundError('Activity type not found')

      activityId = activityRepo.create({
        organizationId,
        leadId: followup.leadId,
        typeId: type.id,
        note: input.activity.note?.trim() || null,
        occurredAt: new Date().toISOString(),
        createdBy: userId
      }).id
    }

    if (change) {
      const { lead, current, target } = change

      if (activityId === null) {
        const noteType = activityTypeRepo.findByName(organizationId, 'NOTE')
        if (!noteType) throw new NotFoundError('NOTE activity type is not configured')
        activityId = activityRepo.create({
          organizationId,
          leadId: lead.id,
          typeId: noteType.id,
          note: input.notes?.trim() ? input.notes : completedFollowupNote(target.name),
          occurredAt: new Date().toISOString(),
          createdBy: userId
        }).id
      }

      machine.assertMoveAllowed(current, target, true)
      leadRepo.updateCurrentStage(organizationId, lead.id, target.id)
      if (current.isLost) leadRepo.clearLostState(organizationId, lead.id)
      stageHistoryRepo.record({
        organizationId,
        leadId: lead.id,
        fromStageId: current.id,
        toStageId: target.id,
        activityId,
        reason: null,
        changedBy: userId
      })

      // Cancel other pending follow-ups when moving to a stage that suppresses them
      if (target.suppressFollowups) {
        const pendingFollowups = followupRepo.listPendingForLead(organizationId, lead.id)
        const reason =
          SUPPRESS_FOLLOWUP_REASONS[target.name] ??
          `Follow-up cancelled — lead moved to ${target.name}`
        for (const fu of pendingFollowups) {
          followupRepo.cancel(organizationId, fu.id, userId, reason)
        }
      }
    }
  })
}

/**
 * Bulk "mark done" for the follow-ups queue selection toolbar. Completes every
 * open follow-up in one transaction; when `stageChange` is given, each lead is
 * validated by the stage machine up front (all-or-nothing) and moved with an
 * auto-NOTE activity + stage history entry, mirroring `bulkMoveLeadStage`.
 * Already-completed follow-ups are skipped silently (idempotent, matching the
 * single `completeFollowUp`). A single IPC call + one SQLite transaction beats
 * N per-follow-up round trips (fewer bridge crossings, one commit).
 */
export function bulkCompleteFollowUps(
  input: BulkCompleteFollowUpsInput
): BulkCompleteFollowUpsResult {
  requirePermission(PERMISSIONS.FOLLOWUP_COMPLETE)
  if (input.stageChange) requirePermission(PERMISSIONS.LEAD_UPDATE_STAGE)
  const organizationId = currentOrganizationId()
  const userId = requireSession().userId

  const followups = input.followUpIds.map((id) => {
    const followup = followupRepo.getById(organizationId, id)
    if (!followup) throw new NotFoundError('Follow-up not found')
    return followup
  })
  const pending = followups.filter((followup) => !followup.completedAt)
  if (pending.length === 0) return { completed: 0 }

  // Refund-only rule, fail-closed before anything completes — regardless of
  // whether the batch also moves stages.
  for (const followup of pending) {
    const pendingLead = leadRepo.getById(organizationId, followup.leadId)
    if (!pendingLead) throw new NotFoundError('Lead not found')
    assertPersonAllowed(organizationId, pendingLead.personId, 'complete a follow-up')
  }

  const machine = stageMachineFor(organizationId)

  const change = input.stageChange
    ? (() => {
        const target = stageRepo.findById(organizationId, input.stageChange!.targetStageId)
        if (!target) throw new NotFoundError('Target stage not found')

        // Validate every move before mutating anything, so a bad lead aborts
        // the batch (all-or-nothing, same rule as `bulkMoveLeadStage`).
        const leadIds = [...new Set(pending.map((followup) => followup.leadId))]
        for (const leadId of leadIds) {
          const lead = leadRepo.getById(organizationId, leadId)
          if (!lead) throw new NotFoundError('Lead not found')
          if (lead.currentStageId === target.id) continue
          const current = stageRepo.findById(organizationId, lead.currentStageId)
          if (!current) throw new NotFoundError('Current stage not found')
          machine.assertMoveAllowed(current, target, true)
        }
        return target
      })()
    : null

  return withTransaction(() => {
    let completed = 0
    for (const followup of pending) {
      followupRepo.complete(organizationId, followup.id, userId)
      completed += 1
    }

    if (change) {
      const noteType = activityTypeRepo.findByName(organizationId, 'NOTE')
      if (!noteType) throw new NotFoundError('NOTE activity type is not configured')

      const movedLeadIds = new Set<number>()
      for (const followup of pending) {
        if (movedLeadIds.has(followup.leadId)) continue
        const lead = leadRepo.getById(organizationId, followup.leadId)
        if (!lead) throw new NotFoundError('Lead not found')
        if (lead.currentStageId === change.id) continue

        const current = stageRepo.findById(organizationId, lead.currentStageId)
        if (!current) throw new NotFoundError('Current stage not found')
        const activity = activityRepo.create({
          organizationId,
          leadId: lead.id,
          typeId: noteType.id,
          note: completedFollowupNote(change.name),
          occurredAt: new Date().toISOString(),
          createdBy: userId
        })
        leadRepo.updateCurrentStage(organizationId, lead.id, change.id)
        if (current.isLost) leadRepo.clearLostState(organizationId, lead.id)
        stageHistoryRepo.record({
          organizationId,
          leadId: lead.id,
          fromStageId: current.id,
          toStageId: change.id,
          activityId: activity.id,
          reason: null,
          changedBy: userId
        })
        movedLeadIds.add(lead.id)

        // Cancel other pending follow-ups when moving to a suppressing stage,
        // exactly like the single `completeFollowUp`.
        if (change.suppressFollowups) {
          const pendingFollowups = followupRepo.listPendingForLead(organizationId, lead.id)
          const reason =
            SUPPRESS_FOLLOWUP_REASONS[change.name] ??
            `Follow-up cancelled — lead moved to ${change.name}`
          for (const other of pendingFollowups) {
            followupRepo.cancel(organizationId, other.id, userId, reason)
          }
        }
      }
    }

    return { completed }
  })
}

/** Extends a follow-up due date with an optional extension reason. */
export function updateFollowUp(input: UpdateFollowUpInput): void {
  requirePermission(PERMISSIONS.FOLLOWUP_UPDATE)
  const organizationId = currentOrganizationId()

  const followup = followupRepo.getById(organizationId, input.followupId)
  if (!followup) throw new NotFoundError('Follow-up not found')
  if (followup.completedAt) throw new ValidationError('Cannot edit a completed follow-up')
  if (followup.cancelledAt) throw new ValidationError('Cannot edit a cancelled follow-up')

  const editedLead = leadRepo.getById(organizationId, followup.leadId)
  if (!editedLead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, editedLead.personId, 'extend a follow-up')

  const due = new Date(input.dueAt)
  if (Number.isNaN(due.getTime())) throw new ValidationError('dueAt must be a valid date')
  if (due.getTime() <= Date.now()) {
    throw new ValidationError('Follow-up due date must be in the future')
  }

  withTransaction(() => {
    followupRepo.update(organizationId, followup.id, {
      dueAt: due.toISOString(),
      extensionReason: input.extensionReason?.trim() || null
    })
  })
}

/** Cancels a follow-up. Idempotent: cancelling an already-cancelled one is a no-op. */
export function cancelFollowUp(input: CancelFollowUpInput): void {
  requirePermission(PERMISSIONS.FOLLOWUP_CANCEL)
  const organizationId = currentOrganizationId()

  const followup = followupRepo.getById(organizationId, input.followupId)
  if (!followup) throw new NotFoundError('Follow-up not found')
  if (followup.completedAt) throw new ValidationError('Cannot cancel a completed follow-up')
  if (followup.cancelledAt) return

  const cancelledLead = leadRepo.getById(organizationId, followup.leadId)
  if (!cancelledLead) throw new NotFoundError('Lead not found')
  assertPersonAllowed(organizationId, cancelledLead.personId, 'cancel a follow-up')

  withTransaction(() => {
    followupRepo.cancel(organizationId, followup.id, requireSession().userId, input.reason)
  })
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const RANGE_DAYS: Record<NonNullable<LeadListRequest['range']>, number> = {
  today: 0,
  week: 7,
  month: 30,
  all: 0
}

/**
 * `leads:list` — the pipeline read model. Filters are optional and map to
 * indexed columns; the nested arrays (activities, follow-ups, stage history)
 * are fetched in three batched IN queries keyed by lead id, so the whole list
 * is assembled in four SQL round-trips regardless of page size.
 */
export function listLeads(input: LeadListRequest): LeadListResponse {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  let createdAfter: string | undefined
  if (input.range && input.range !== 'all') {
    const days = RANGE_DAYS[input.range]
    const start = days === 0 ? new Date() : new Date(Date.now() - days * 86_400_000)
    createdAfter = localDayUtcRange(orgTimezone(organizationId), start).start
  }

  const { items: base, total } = leadRepo.list({
    organizationId,
    search: input.search?.trim() || undefined,
    stageId: input.stageId,
    sourceId: input.sourceId,
    ownerUserId: input.ownerUserId,
    createdAfter,
    page: input.page,
    limit: input.limit
  })

  const leadIds = base.map((r) => r.id)
  const activities = activityRepo.listForLeadIds(organizationId, leadIds)
  const followUps = followupRepo.listForLeadIds(organizationId, leadIds)
  const history = stageHistoryRepo.listForLeadIds(organizationId, leadIds)

  const activitiesByLead = groupBy(activities, (a) => a.leadId)
  const followUpsByLead = groupBy(followUps, (f) => f.leadId)
  const historyByLead = groupBy(history, (h) => h.leadId)

  const items = base.map((row) => ({
    id: row.id,
    personId: row.personId,
    personName: row.personName,
    phone: row.phone,
    email: row.email,
    photoFilename: row.photoFilename,
    isBlacklisted: row.isBlacklisted,
    blacklistedReason: row.blacklistedReason,
    sourceId: row.sourceId,
    sourceName: row.sourceName,
    stageId: row.stageId,
    stageName: row.stageName,
    isWon: row.isWon,
    isLost: row.isLost,
    ownerUserId: row.ownerUserId,
    ownerName: row.ownerName,
    customerId: row.customerId,
    planId: row.planId,
    planName: row.planName,
    goal: row.goal,
    notes: row.notes,
    createdAt: row.createdAt,
    lostReasonId: row.lostReasonId,
    lostReasonName: row.lostReasonName,
    lostAt: row.lostAt,
    activities: activitiesByLead.get(row.id) ?? [],
    followUps: followUpsByLead.get(row.id) ?? [],
    stageHistory: historyByLead.get(row.id) ?? []
  }))

  return {
    items,
    page: input.page,
    limit: input.limit,
    total,
    hasMore: input.page * input.limit < total
  }
}

function groupBy<T>(rows: T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

export function getLeadDetails(input: LeadIdRequest): {
  leadId: number
  personName: string
  phone: string
  email: string | null
  sourceName: string
  stageName: string
  status: 'OPEN' | 'WON' | 'LOST'
  ownerName: string | null
  createdAt: string
} | null {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) return null
  const person = personRepo.findById(organizationId, lead.personId)
  const source = sourceRepo.findById(organizationId, lead.sourceId)
  const stage = stageRepo.findById(organizationId, lead.currentStageId)
  if (!person || !source || !stage) return null

  const owner = lead.ownerUserId ? userRepo.findById(lead.ownerUserId) : null

  return {
    leadId: lead.id,
    personName: person.fullName,
    phone: person.phone,
    email: person.email,
    sourceName: source.name,
    stageName: stage.name,
    status: deriveLeadStatus(stage),
    ownerName: owner?.fullName ?? null,
    createdAt: lead.createdAt
  }
}

/** The §24 timeline: merged activities + stage history + follow-ups, newest first. */
export function getLeadTimeline(input: LeadIdRequest): Array<{
  kind: 'activity' | 'stage' | 'followup'
  at: string
  label: string
}> {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) return []

  const stages = new Map(stageRepo.findAll(organizationId).map((s) => [s.id, s]))
  const types = new Map(activityTypeRepo.findAll(organizationId).map((t) => [t.id, t.name]))

  const entries: Array<{ kind: 'activity' | 'stage' | 'followup'; at: string; label: string }> = []

  for (const a of activityRepo.listForLead(organizationId, lead.id)) {
    entries.push({
      kind: 'activity',
      at: a.occurredAt,
      label: types.get(a.typeId) ?? 'Activity'
    })
  }
  for (const h of stageHistoryRepo.listForLead(organizationId, lead.id)) {
    const from = h.fromStageId ? stages.get(h.fromStageId)?.name : 'New'
    const to = stages.get(h.toStageId)?.name ?? '?'
    entries.push({ kind: 'stage', at: h.changedAt, label: `Stage: ${from} → ${to}` })
  }
  for (const f of followupRepo.listForLead(organizationId, lead.id)) {
    entries.push({
      kind: 'followup',
      at: f.completedAt ?? f.dueAt,
      label: `Follow-up: ${f.title}${f.completedAt ? ' (done)' : ''}`
    })
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}

export function getNewLeads(): { id: number; personName: string; phone: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listNew(currentOrganizationId())
}

export function getUncontactedLeads(): { id: number; personName: string; phone: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listUncontacted(currentOrganizationId())
}

export function getFunnelCounts(): FunnelCounts {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.getFunnelCounts(currentOrganizationId())
}

export function getTodaysFollowups(): {
  followupId: number
  leadId: number
  title: string
  dueAt: string
}[] {
  requirePermission(PERMISSIONS.FOLLOWUP_VIEW)
  const organizationId = currentOrganizationId()
  const { start, end } = localDayUtcRange(orgTimezone(organizationId), new Date())
  return followupRepo
    .listDueBetween(organizationId, start, end)
    .map((f) => ({ followupId: f.id, leadId: f.leadId, title: f.title, dueAt: f.dueAt }))
}

export function getOverdueFollowups(): {
  followupId: number
  leadId: number
  title: string
  dueAt: string
}[] {
  requirePermission(PERMISSIONS.FOLLOWUP_VIEW)
  const organizationId = currentOrganizationId()
  return followupRepo
    .listOverdueBefore(organizationId, new Date().toISOString())
    .map((f) => ({ followupId: f.id, leadId: f.leadId, title: f.title, dueAt: f.dueAt }))
}

export function getTrialsEnding(): { id: number; personName: string; dueAt: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listTrialsEnding(currentOrganizationId())
}

export function getRecentlyWon(): { id: number; personName: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listRecentlyWon(currentOrganizationId())
}

export function getRecentlyLost(): { id: number; personName: string }[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  return leadRepo.listRecentlyLost(currentOrganizationId())
}

export function searchPeople(query: string): PeopleList {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return personRepo.search(organizationId, query.trim(), 50, 0)
}

/**
 * Reactive duplicate probe for the lead forms (see docs/107). Given the
 * name/phone/email currently typed, reports whether an org person already owns
 * the phone, whether their name matches (the unique-together key that blocks a
 * duplicate lead), and whether another person holds the same email (advisory).
 * Pure read — no transaction, no writes. An unparseable phone is treated as "no
 * match yet" so an in-progress number never throws from the form.
 */
export function checkLeadPersonAvailability(input: CheckLeadPersonInput): LeadPersonAvailability {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()

  let normalizedPhone: string
  try {
    normalizedPhone = IndianMobileNumber.parse(input.phone).value
  } catch {
    return {
      phoneTaken: false,
      sameNamedPerson: false,
      matchedPerson: null,
      emailTaken: false,
      emailOwnerName: null
    }
  }

  const matched = personRepo.findByPhone(organizationId, normalizedPhone)
  const matchedPerson = matched && matched.id !== input.excludePersonId ? matched : null

  const email = input.email?.trim().toLowerCase()
  const emailOwner = email
    ? personRepo.findByEmail(organizationId, email, matchedPerson?.id ?? input.excludePersonId)
    : null

  return {
    phoneTaken: matchedPerson != null,
    sameNamedPerson:
      matchedPerson != null && samePersonName(matchedPerson.fullName, input.fullName),
    matchedPerson: matchedPerson
      ? {
          id: matchedPerson.id,
          fullName: matchedPerson.fullName,
          phone: matchedPerson.phone,
          isBlacklisted: matchedPerson.isBlacklisted,
          blacklistedReason: matchedPerson.blacklistedReason
        }
      : null,
    emailTaken: emailOwner != null,
    emailOwnerName: emailOwner?.fullName ?? null
  }
}

export function getReferenceData(): ReferenceData {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return {
    sources: stageRepo.findAllSources(organizationId),
    stages: stageRepo.findAll(organizationId),
    lostReasons: lostReasonRepo.findAll(organizationId),
    activityTypes: activityTypeRepo.findAll(organizationId)
  }
}

/** Live source search for the combobox — active sources, ordered by sort order. */
export function searchLeadSources(input: LeadSourceSearchRequest): LeadSourceRow[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  return sourceRepo.search(organizationId, input.query.trim(), 20)
}

/**
 * Creates a lead source. Settings scoped so only admins can grow the vocabulary;
 * the duplicate check is case-insensitive even though the schema constraint is
 * case-sensitive, so "instagram" and "Instagram" can't both be created.
 */
export function createLeadSource(input: CreateLeadSourceInput): LeadSourceRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const name = input.name.trim()
  if (!name) throw new ValidationError('Source name is required')
  if (sourceRepo.findByName(organizationId, name)) {
    throw new ConflictError(`A source named "${name}" already exists`)
  }
  return withTransaction(() => sourceRepo.create(organizationId, name))
}

const LEAD_VOCABULARY_LIMIT = 20

/**
 * Plan-interest / goal autocomplete. The vocabulary is data-driven: distinct
 * free-text values already used on this org's leads (no lookup table), so
 * "creating" an option is simply committing the typed text — the value itself
 * is the identity (`id === label`). Trimmed and de-duplicated case-insensitively.
 */
function searchLeadVocabulary(
  input: LeadVocabularySearchRequest,
  field: string,
  values: (organizationId: number, query: string, limit: number) => string[]
): LeadTextOptionRow[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  const query = input.query.trim()
  const seen = new Set<string>()
  const options: LeadTextOptionRow[] = []
  for (const raw of values(organizationId, query, LEAD_VOCABULARY_LIMIT)) {
    const value = raw.trim()
    const key = value.toLocaleLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    options.push({ id: value, label: value })
    if (options.length >= LEAD_VOCABULARY_LIMIT) break
  }
  logger.info(`vocab search "${field}"`, { organizationId, query, count: options.length })
  return options
}

/**
 * Plan picker for the lead form. Plans are real catalog rows (Module 03), so the
 * option identity is the numeric plan id — the picker offers only active plans,
 * and creating a plan happens in the Catalog module, never from a lead form.
 */
export function searchLeadPlans(input: PlanSearchRequest): PlanOptionRow[] {
  requirePermission(PERMISSIONS.LEAD_VIEW)
  const organizationId = currentOrganizationId()
  const query = input.query.trim()
  const options = planRepo.searchActive(organizationId, query, LEAD_VOCABULARY_LIMIT)
  logger.info('plan search', { organizationId, query, count: options.length })
  return options.map((plan) => ({ id: plan.id, name: plan.name }))
}

export function searchLeadGoals(input: LeadVocabularySearchRequest): LeadTextOptionRow[] {
  return searchLeadVocabulary(input, 'goal', (organizationId, query, limit) =>
    leadRepo.distinctGoals(organizationId, query, limit)
  )
}
