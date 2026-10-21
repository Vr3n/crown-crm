import { describe, it, expect } from 'vitest'
import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import {
  assignLead,
  bulkCompleteFollowUps,
  bulkMoveLeadStage,
  bulkRecordActivity,
  bulkScheduleFollowUp,
  completeFollowUp,
  createLead,
  createLeadSource,
  deleteLeads,
  editLead,
  getFunnelCounts,
  getLeadDetails,
  getLeadTimeline,
  getNewLeads,
  getUncontactedLeads,
  getReferenceData,
  listLeads,
  markLeadLost,
  moveLeadStage,
  recordLeadActivity,
  scheduleFollowUp,
  searchLeadGoals,
  searchLeadPlans,
  searchLeadSources,
  checkLeadPersonAvailability
} from '../../../src/main/application/leads'
import { activityRepo, leadRepo } from '../../../src/main/repositories/sales'
import {
  organizationRepo,
  roleRepo,
  userRepo,
  staffRepo
} from '../../../src/main/repositories/identity'
import { setSession } from '../../../src/main/auth/session'
import type { SessionContext } from '../../../src/main/domain/identity'
import { getDb } from '../../../src/main/db/connection'
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError
} from '../../../src/main/domain/errors'

setupSalesDb()

function createSourceId(organizationId: number): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_sources WHERE organization_id = ? ORDER BY sort_order LIMIT 1')
    .get(organizationId) as { id: number }
  return row.id
}

function planIdByName(organizationId: number, name: string): number {
  const row = getDb()
    .prepare('SELECT id FROM membership_plans WHERE organization_id = ? AND name = ?')
    .get(organizationId, name) as { id: number }
  return row.id
}

function stageIdByName(organizationId: number, name: string): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_stages WHERE organization_id = ? AND name = ?')
    .get(organizationId, name) as { id: number }
  return row.id
}

function activityTypeId(organizationId: number, name: string): number {
  const row = getDb()
    .prepare('SELECT id FROM lead_activity_types WHERE organization_id = ? AND name = ?')
    .get(organizationId, name) as { id: number }
  return row.id
}

/** Creates a lead, returning its id and phone. Each call uses a distinct phone. */
let leadCounter = 0
function createLeadFor(organizationId: number): { leadId: number; phone: string } {
  const sourceId = createSourceId(organizationId)
  const phone = `9${String(100000000 + ++leadCounter)}`
  const { leadId } = createLead({
    fullName: 'Rahul Sharma',
    phone,
    sourceId
  })
  return { leadId, phone }
}

let signInCounter = 0
/** Creates a brand-new staff member in the given role and switches the session to them. */
function signInAs(organizationId: number, roleName: string): number {
  const org = organizationRepo.findById(organizationId)
  const user = userRepo.create({
    fullName: 'Sana Kapoor',
    email: `sana${++signInCounter}@fitgym.com`,
    passwordHash: 'h'
  })
  const role = roleRepo.findByName(organizationId, roleName)
  staffRepo.create({ organizationId, userId: user.id, roleId: role.id })
  const session: SessionContext = {
    organizationId,
    organizationSlug: org.slug,
    organizationName: org.name,
    userId: user.id,
    userFullName: user.fullName,
    userEmail: user.email,
    roleId: role.id,
    roleName: role.name,
    isSuper: role.isSuper,
    permissions: roleRepo.findPermissionCodes(role.id)
  }
  setSession(session)
  return user.id
}

describe('createLead', () => {
  it('creates a person + lead at the initial stage in one transaction', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const { leadId, personId } = createLead({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      sourceId
    })

    const person = getDb()
      .prepare('SELECT full_name, phone FROM people WHERE id = ?')
      .get(personId) as { full_name: string; phone: string }
    expect(person).toEqual({ full_name: 'Rahul Sharma', phone: '9876543210' })

    const lead = getDb()
      .prepare(
        `SELECT person_id, current_stage_id, owner_user_id, created_by
         FROM leads WHERE id = ?`
      )
      .get(leadId) as {
      person_id: number
      current_stage_id: number
      owner_user_id: number
      created_by: number
    }
    expect(lead.person_id).toBe(personId)
    expect(lead.current_stage_id).toBe(stageIdByName(organizationId, 'NEW'))
    expect(lead.owner_user_id).toBe(userId) // default owner = creator
    expect(lead.created_by).toBe(userId)

    // Initial history row: from = NULL, activity = NULL
    const history = getDb()
      .prepare(
        `SELECT from_stage_id, to_stage_id, activity_id, reason
         FROM lead_stage_history WHERE lead_id = ?`
      )
      .all(leadId) as {
      from_stage_id: number | null
      to_stage_id: number
      activity_id: number | null
      reason: string | null
    }[]
    expect(history).toHaveLength(1)
    expect(history[0]).toEqual({
      from_stage_id: null,
      to_stage_id: lead.current_stage_id,
      activity_id: null,
      reason: null
    })
  })

  it('persists plan, goal, and notes', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const planId = planIdByName(organizationId, 'Annual')

    const { leadId } = createLead({
      fullName: 'Sana Kapoor',
      phone: '9876543210',
      sourceId,
      planId,
      goal: 'Weight loss',
      notes: 'Asked about pool access'
    })

    const lead = getDb()
      .prepare('SELECT plan_id, goal, notes FROM leads WHERE id = ?')
      .get(leadId) as { plan_id: number | null; goal: string | null; notes: string | null }
    expect(lead).toEqual({
      plan_id: planId,
      goal: 'Weight loss',
      notes: 'Asked about pool access'
    })
  })

  it('stores blank optional fields as NULL', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const { leadId } = createLead({
      fullName: 'Sana Kapoor',
      phone: '9876543210',
      sourceId,
      planId: undefined,
      goal: '',
      notes: undefined
    })

    const lead = getDb()
      .prepare('SELECT plan_id, goal, notes FROM leads WHERE id = ?')
      .get(leadId) as { plan_id: number | null; goal: string | null; notes: string | null }
    expect(lead).toEqual({ plan_id: null, goal: null, notes: null })
  })

  it('rejects a plan that does not belong to this organization', () => {
    const { organizationId: orgA } = seedOrgWithSession()
    const { organizationId: orgB } = seedOrgWithSession()
    const sourceId = createSourceId(orgA)
    const foreignPlan = planIdByName(orgB, 'Annual')

    expect(() =>
      createLead({
        fullName: 'Sana Kapoor',
        phone: '9876543210',
        sourceId,
        planId: foreignPlan
      })
    ).toThrow(NotFoundError)
  })

  it('reuses an existing person once the previous lead is terminal (lost)', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const first = createLead({ fullName: 'Rahul Sharma', phone: '9876543210', sourceId })
    const reasonId = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId: first.leadId, lostReasonId: reasonId.id })

    const second = createLead({ fullName: 'Rahul S.', phone: '+91 9876543210', sourceId })

    const personCount = (getDb().prepare('SELECT COUNT(*) AS n FROM people').get() as { n: number })
      .n
    expect(personCount).toBe(1) // person reused, not duplicated
    expect(second.personId).toBe(first.personId)
  })

  it('rejects a second active lead for the same person', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })
    expect(() => createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })).toThrow(
      ConflictError
    )
  })

  it('allows a new lead once the previous one is terminal (lost)', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const { leadId } = createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })
    const reasonId = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reasonId.id })

    expect(() => createLead({ fullName: 'Rahul', phone: '9876543210', sourceId })).not.toThrow()
  })

  it('rejects an unknown source', () => {
    seedOrgWithSession()
    expect(() => createLead({ fullName: 'R', phone: '9876543210', sourceId: 99999 })).toThrow(
      NotFoundError
    )
  })

  it('rejects an invalid phone number', () => {
    seedOrgWithSession()
    expect(() => createLead({ fullName: 'R', phone: '12345', sourceId: 1 })).toThrow(
      ValidationError
    )
  })

  it('throws PERMISSION_DENIED without lead.create', () => {
    const { organizationId } = seedOrgWithSession('Finance')
    const sourceId = createSourceId(organizationId)
    expect(() => createLead({ fullName: 'R', phone: '9876543210', sourceId })).toThrow(
      ForbiddenError
    )
  })
})

describe('editLead', () => {
  it('updates the person and lead fields and records a NOTE activity', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId, phone } = createLeadFor(organizationId)
    const sourceId = createSourceId(organizationId)

    editLead({
      leadId,
      fullName: 'Rahul Sharma Updated',
      phone,
      email: 'rahul@example.com',
      sourceId,
      planId: planIdByName(organizationId, 'Annual'),
      goal: 'Weight loss',
      notes: 'Prefers evening sessions'
    })

    const lead = leadRepo.getById(organizationId, leadId)
    const person = getDb()
      .prepare('SELECT full_name, phone, email FROM people WHERE id = ?')
      .get(lead.personId) as { full_name: string; phone: string; email: string | null }
    expect(person).toEqual({
      full_name: 'Rahul Sharma Updated',
      phone,
      email: 'rahul@example.com'
    })
    expect(lead).toMatchObject({
      sourceId,
      planId: planIdByName(organizationId, 'Annual'),
      goal: 'Weight loss',
      notes: 'Prefers evening sessions'
    })
    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      typeId: activityTypeId(organizationId, 'NOTE'),
      note: 'Lead details updated',
      createdBy: userId
    })
  })

  it('lets the owner edit their own lead (non-super)', () => {
    const { organizationId } = seedOrgWithSession('Sales')
    const { leadId, phone } = createLeadFor(organizationId)
    expect(() =>
      editLead({
        leadId,
        fullName: 'Rahul Sharma',
        phone,
        sourceId: createSourceId(organizationId)
      })
    ).not.toThrow()
  })

  it('rejects an edit by a different owner even with lead.edit', () => {
    const { organizationId } = seedOrgWithSession('Sales')
    const { leadId } = createLeadFor(organizationId)
    signInAs(organizationId, 'Sales')

    expect(() =>
      editLead({
        leadId,
        fullName: 'Rahul Sharma',
        phone: '9812345678',
        sourceId: createSourceId(organizationId)
      })
    ).toThrow(ForbiddenError)
  })

  it('lets an admin (super) edit a lead they do not own', () => {
    const { organizationId } = seedOrgWithSession() // seeded Owner session is super
    const { leadId, phone } = createLeadFor(organizationId)
    const other = signInAs(organizationId, 'Sales')
    // Reassign ownership to the Sales user so the Owner is no longer the owner.
    getDb().prepare('UPDATE leads SET owner_user_id = ? WHERE id = ?').run(other, leadId)
    signInAs(organizationId, 'Owner')

    expect(() =>
      editLead({
        leadId,
        fullName: 'Rahul Sharma',
        phone,
        sourceId: createSourceId(organizationId)
      })
    ).not.toThrow()
  })

  it('rejects an unknown lead with NotFoundError', () => {
    seedOrgWithSession()
    expect(() =>
      editLead({ leadId: 99999, fullName: 'R', phone: '9812345678', sourceId: 1 })
    ).toThrow(NotFoundError)
  })

  it('rejects an unknown source with NotFoundError', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId, phone } = createLeadFor(organizationId)
    expect(() => editLead({ leadId, fullName: 'R', phone, sourceId: 99999 })).toThrow(NotFoundError)
  })

  it('rejects a phone already used by another person with ConflictError', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createLeadFor(organizationId)
    const second = createLeadFor(organizationId)
    expect(() =>
      editLead({
        leadId: second.leadId,
        fullName: 'Rahul Sharma',
        phone: first.phone,
        sourceId: createSourceId(organizationId)
      })
    ).toThrow(ConflictError)
    expect(leadRepo.getById(organizationId, second.leadId).planId).toBeNull()
  })

  it('allows keeping the person’s own phone number', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId, phone } = createLeadFor(organizationId)
    expect(() =>
      editLead({
        leadId,
        fullName: 'Rahul Sharma',
        phone,
        sourceId: createSourceId(organizationId)
      })
    ).not.toThrow()
  })

  it('denies without lead.edit', () => {
    seedOrgWithSession('Front Desk')
    expect(() => editLead({ leadId: 1, fullName: 'R', phone: '9812345678', sourceId: 1 })).toThrow(
      ForbiddenError
    )
  })
})

describe('moveLeadStage', () => {
  it('moves to any intermediate stage with an activity', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const phoneType = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId: phoneType,
      note: 'Called Rahul',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })

    const target = stageIdByName(organizationId, 'CONTACTED')
    const initial = stageIdByName(organizationId, 'NEW')
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: target,
        expectedStageId: initial,
        activityId: activity.id
      })
    ).not.toThrow()

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(target)
  })

  it('rejects a move without an activity (or with a foreign activity)', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const target = stageIdByName(organizationId, 'CONTACTED')
    const initial = stageIdByName(organizationId, 'NEW')
    const { leadId: foreignLeadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const foreignActivity = activityRepo.create({
      organizationId,
      leadId: foreignLeadId,
      typeId,
      note: 'Other lead activity',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })

    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: target,
        expectedStageId: initial,
        activityId: foreignActivity.id
      })
    ).toThrow(NotFoundError)
  })

  it('rejects a move into a WON stage', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: stageIdByName(organizationId, 'WON'),
        expectedStageId: stageIdByName(organizationId, 'NEW'),
        activityId: activity.id
      })
    ).toThrow(InvalidStateTransitionError)
  })

  it('re-opens a LOST lead, clearing lost markers but keeping history', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id, name FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number; name: string }
    markLeadLost({ leadId, lostReasonId: reason.id })

    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'win back',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId,
      targetStageId: stageIdByName(organizationId, 'CONTACTED'),
      expectedStageId: stageIdByName(organizationId, 'LOST'),
      activityId: activity.id
    })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))
    expect(lead.lostReasonId).toBeNull()
    expect(lead.lostAt).toBeNull()

    // Audit trail preserved: the LOST entry (with reason) plus the re-open entry.
    const history = getDb()
      .prepare(
        'SELECT from_stage_id, to_stage_id, reason FROM lead_stage_history WHERE lead_id = ? ORDER BY id'
      )
      .all(leadId) as { from_stage_id: number; to_stage_id: number; reason: string | null }[]
    const lostId = stageIdByName(organizationId, 'LOST')
    const contactedId = stageIdByName(organizationId, 'CONTACTED')
    expect(history).toContainEqual(
      expect.objectContaining({ to_stage_id: lostId, reason: reason.name })
    )
    expect(history[history.length - 1]).toMatchObject({
      from_stage_id: lostId,
      to_stage_id: contactedId
    })
  })

  it('still rejects a move out of WON', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const wonId = stageIdByName(organizationId, 'WON')
    leadRepo.updateCurrentStage(organizationId, leadId, wonId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: wonId,
        activityId: activity.id
      })
    ).toThrow(InvalidStateTransitionError)
    expect(leadRepo.getById(organizationId, leadId)!.currentStageId).toBe(wonId)
  })

  it('rejects a stale optimistic concurrency token', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    expect(() =>
      moveLeadStage({
        leadId,
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: 99999, // stale on purpose
        activityId: activity.id
      })
    ).toThrow(ConflictError)
  })
})

describe('bulkMoveLeadStage', () => {
  it('moves several leads with a NOTE activity and stage history each', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createLeadFor(organizationId)
    const second = createLeadFor(organizationId)
    const target = stageIdByName(organizationId, 'CONTACTED')
    const initial = stageIdByName(organizationId, 'NEW')

    const result = bulkMoveLeadStage({
      leadIds: [first.leadId, second.leadId],
      targetStageId: target
    })

    expect(result).toEqual({ moved: 2 })
    for (const { leadId } of [first, second]) {
      const lead = leadRepo.getById(organizationId, leadId)!
      expect(lead.currentStageId).toBe(target)

      const activities = activityRepo.listForLead(organizationId, leadId)
      expect(activities).toHaveLength(1)
      expect(activities[0].typeId).toBe(activityTypeId(organizationId, 'NOTE'))
      expect(activities[0].note).toBe('Bulk move to CONTACTED')

      const history = getDb()
        .prepare(
          'SELECT from_stage_id, to_stage_id, activity_id FROM lead_stage_history WHERE lead_id = ?'
        )
        .all(leadId) as { from_stage_id: number | null; to_stage_id: number }[]
      expect(history).toHaveLength(2) // initial + bulk move
      expect(history[1]).toEqual({
        from_stage_id: initial,
        to_stage_id: target,
        activity_id: expect.any(Number)
      })
    }
  })

  it('skips leads already at the target stage', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const moved = createLeadFor(organizationId)
    const already = createLeadFor(organizationId)
    const target = stageIdByName(organizationId, 'CONTACTED')

    // Pre-move one lead into CONTACTED via the strict single-move path.
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId: already.leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId: already.leadId,
      targetStageId: target,
      expectedStageId: stageIdByName(organizationId, 'NEW'),
      activityId: activity.id
    })

    const result = bulkMoveLeadStage({
      leadIds: [moved.leadId, already.leadId],
      targetStageId: target
    })

    expect(result).toEqual({ moved: 1 })
    expect(leadRepo.getById(organizationId, moved.leadId)!.currentStageId).toBe(target)
    expect(leadRepo.getById(organizationId, already.leadId)!.currentStageId).toBe(target)
  })

  it('rejects a terminal target and moves nothing', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const target = stageIdByName(organizationId, 'WON')

    expect(() => bulkMoveLeadStage({ leadIds: [leadId], targetStageId: target })).toThrow(
      InvalidStateTransitionError
    )
    expect(leadRepo.getById(organizationId, leadId)!.currentStageId).toBe(
      stageIdByName(organizationId, 'NEW')
    )
  })

  it('re-opens LOST leads, clearing lost markers', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reason.id })

    const result = bulkMoveLeadStage({
      leadIds: [leadId],
      targetStageId: stageIdByName(organizationId, 'CONTACTED')
    })

    expect(result).toEqual({ moved: 1 })
    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))
    expect(lead.lostReasonId).toBeNull()
    expect(lead.lostAt).toBeNull()
  })

  it('throws NotFoundError when any lead id is unknown', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() =>
      bulkMoveLeadStage({
        leadIds: [leadId, 99999],
        targetStageId: stageIdByName(organizationId, 'CONTACTED')
      })
    ).toThrow(NotFoundError)
  })

  it('denies without lead.update_stage', () => {
    seedOrgWithSession('Finance')
    expect(() => bulkMoveLeadStage({ leadIds: [1], targetStageId: 1 })).toThrow(ForbiddenError)
  })
})

describe('deleteLeads', () => {
  it('deletes leads with activities, follow-ups, and stage history, preserving people', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'Called Rahul',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    scheduleFollowUp({
      leadId,
      title: 'Re-call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    const personId = leadRepo.getById(organizationId, leadId)!.personId
    const personCount = getDb()
      .prepare('SELECT COUNT(*) AS n FROM people WHERE id = ?')
      .get(personId) as { n: number }

    expect(() => deleteLeads({ leadIds: [leadId] })).not.toThrow()

    expect(leadRepo.getById(organizationId, leadId)).toBeNull()
    expect(
      (
        getDb()
          .prepare('SELECT COUNT(*) AS n FROM lead_activities WHERE lead_id = ?')
          .get(leadId) as {
          n: number
        }
      ).n
    ).toBe(0)
    expect(
      (
        getDb()
          .prepare('SELECT COUNT(*) AS n FROM lead_followups WHERE lead_id = ?')
          .get(leadId) as {
          n: number
        }
      ).n
    ).toBe(0)
    expect(
      (
        getDb()
          .prepare('SELECT COUNT(*) AS n FROM lead_stage_history WHERE lead_id = ?')
          .get(leadId) as {
          n: number
        }
      ).n
    ).toBe(0)
    // The person row survives — they can hold other leads.
    expect(
      (
        getDb().prepare('SELECT COUNT(*) AS n FROM people WHERE id = ?').get(personId) as {
          n: number
        }
      ).n
    ).toBe(personCount.n)
  })

  it('deletes multiple leads atomically', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createLeadFor(organizationId)
    const second = createLeadFor(organizationId)

    deleteLeads({ leadIds: [first.leadId, second.leadId] })

    expect(leadRepo.getById(organizationId, first.leadId)).toBeNull()
    expect(leadRepo.getById(organizationId, second.leadId)).toBeNull()
  })

  it('throws NotFoundError when any id does not belong to the org', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() => deleteLeads({ leadIds: [leadId, 99999] })).toThrow(NotFoundError)
    expect(leadRepo.getById(organizationId, leadId)).not.toBeNull() // nothing deleted
  })

  it('denies without lead.delete', () => {
    seedOrgWithSession('Front Desk')
    expect(() => deleteLeads({ leadIds: [1] })).toThrow(ForbiddenError)
  })
})

describe('markLeadLost', () => {
  it('marks the lead lost with reason and writes history', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id, name FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number; name: string }

    markLeadLost({ leadId, lostReasonId: reason.id })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'LOST'))
    expect(lead.lostReasonId).toBe(reason.id)
    expect(lead.lostAt).not.toBeNull()
    expect(lead.lostBy).not.toBeNull()

    const history = getDb()
      .prepare(
        'SELECT from_stage_id, to_stage_id, activity_id, reason FROM lead_stage_history WHERE lead_id = ?'
      )
      .all(leadId) as { reason: string | null }[]
    expect(history[history.length - 1].reason).toBe(reason.name)
  })

  it('rejects a reason from another org', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() => markLeadLost({ leadId, lostReasonId: 99999 })).toThrow(NotFoundError)
  })

  it('rejects marking an already-lost lead lost again', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const reason = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reason.id })
    expect(() => markLeadLost({ leadId, lostReasonId: reason.id })).toThrow(
      InvalidStateTransitionError
    )
  })
})

describe('recordLeadActivity', () => {
  it('records an activity without touching the stage', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'WALK_IN')

    recordLeadActivity({
      leadId,
      typeId,
      note: 'Talked about annual plan',
      occurredAt: new Date().toISOString()
    })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'NEW')) // unchanged
    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      typeId,
      note: 'Talked about annual plan',
      createdBy: userId
    })
  })
})

describe('assignLead', () => {
  it('writes an OWNER_CHANGE activity on reassignment', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)

    const other = userRepo.create({
      fullName: 'Sana',
      email: 'sana@fitgym.com',
      passwordHash: 'h'
    })
    const role = getDb()
      .prepare('SELECT id FROM roles WHERE organization_id = ? AND name = ?')
      .get(organizationId, 'Sales') as { id: number }
    staffRepo.create({ organizationId, userId: other.id, roleId: role.id })

    assignLead({ leadId, ownerUserId: other.id })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.ownerUserId).toBe(other.id)
    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0].typeId).toBe(activityTypeId(organizationId, 'OWNER_CHANGE'))
  })

  it('is a no-op when assigning the same owner', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() => assignLead({ leadId, ownerUserId: userId })).not.toThrow()
    expect(activityRepo.listForLead(organizationId, leadId)).toHaveLength(0)
  })
})

describe('bulkScheduleFollowUp', () => {
  it('schedules one follow-up per selected lead', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createLeadFor(organizationId)
    const second = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()

    const result = bulkScheduleFollowUp({
      leadIds: [first.leadId, second.leadId],
      title: '  Re-call for trial  ',
      dueAt: future
    })

    expect(result).toEqual({ scheduled: 2 })
    for (const { leadId } of [first, second]) {
      // The lead also carries the auto-created default follow-up from createLead;
      // the bulk-scheduled one is the newest row.
      const followup = getDb()
        .prepare(
          'SELECT title, due_at FROM lead_followups WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 1'
        )
        .get(leadId) as { title: string; due_at: string }
      expect(followup.title).toBe('Re-call for trial') // trimmed
      expect(followup.due_at).toBe(future)
    }
  })

  it('rejects a past due date before writing anything', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    // createLead already auto-created the default follow-up for this lead.
    const before = (
      getDb().prepare('SELECT COUNT(*) AS n FROM lead_followups WHERE lead_id = ?').get(leadId) as {
        n: number
      }
    ).n
    expect(() =>
      bulkScheduleFollowUp({
        leadIds: [leadId],
        title: 'x',
        dueAt: new Date(Date.now() - 1000).toISOString()
      })
    ).toThrow(ValidationError)
    expect(
      (
        getDb()
          .prepare('SELECT COUNT(*) AS n FROM lead_followups WHERE lead_id = ?')
          .get(leadId) as {
          n: number
        }
      ).n
    ).toBe(before)
  })

  it('throws NotFoundError when any id is unknown', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() =>
      bulkScheduleFollowUp({
        leadIds: [leadId, 99999],
        title: 'x',
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      })
    ).toThrow(NotFoundError)
  })

  it('denies without followup.create', () => {
    seedOrgWithSession('Finance')
    expect(() =>
      bulkScheduleFollowUp({
        leadIds: [1],
        title: 'x',
        dueAt: new Date(Date.now() + 86_400_000).toISOString()
      })
    ).toThrow(ForbiddenError)
  })
})

describe('bulkRecordActivity', () => {
  it('records one activity per selected lead', () => {
    const { organizationId } = seedOrgWithSession()
    const first = createLeadFor(organizationId)
    const second = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')

    const result = bulkRecordActivity({
      leadIds: [first.leadId, second.leadId],
      typeId,
      note: 'Called to confirm trial',
      occurredAt: new Date().toISOString()
    })

    expect(result).toEqual({ recorded: 2 })
    for (const { leadId } of [first, second]) {
      const activities = activityRepo.listForLead(organizationId, leadId)
      expect(activities).toHaveLength(1)
      expect(activities[0]).toMatchObject({
        typeId,
        note: 'Called to confirm trial'
      })
    }
  })

  it('throws NotFoundError for an unknown lead or type', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const now = new Date().toISOString()
    expect(() =>
      bulkRecordActivity({ leadIds: [leadId, 99999], typeId, note: 'x', occurredAt: now })
    ).toThrow(NotFoundError)
    expect(() =>
      bulkRecordActivity({ leadIds: [leadId], typeId: 99999, note: 'x', occurredAt: now })
    ).toThrow(NotFoundError)
  })

  it('denies without lead.record_activity', () => {
    seedOrgWithSession('Finance')
    expect(() =>
      bulkRecordActivity({
        leadIds: [1],
        typeId: 1,
        note: 'x',
        occurredAt: new Date().toISOString()
      })
    ).toThrow(ForbiddenError)
  })
})

describe('follow-ups', () => {
  it('schedules and idempotently completes a follow-up', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()

    const { followupId } = scheduleFollowUp({ leadId, title: 'Call Rahul', dueAt: future })
    completeFollowUp({ followupId, notes: 'Spoke — will decide Friday' })
    expect(() => completeFollowUp({ followupId })).not.toThrow() // idempotent

    const followup = getDb()
      .prepare('SELECT completed_at, notes FROM lead_followups WHERE id = ?')
      .get(followupId) as { completed_at: string | null; notes: string | null }
    expect(followup.completed_at).not.toBeNull()
    expect(followup.notes).toBe('Spoke — will decide Friday')
  })

  it('rejects a due date in the past', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    expect(() =>
      scheduleFollowUp({
        leadId,
        title: 'x',
        dueAt: new Date(Date.now() - 1000).toISOString()
      })
    ).toThrow(ValidationError)
  })

  it('moves the lead stage atomically when completing with a stageChange', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')

    expect(() =>
      completeFollowUp({
        followupId,
        notes: 'Will decide Friday',
        activity: { typeId, note: 'Spoke with Rahul' },
        stageChange: {
          targetStageId: stageIdByName(organizationId, 'CONTACTED'),
          expectedStageId: stageIdByName(organizationId, 'NEW')
        }
      })
    ).not.toThrow()

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))

    // The move links the activity logged alongside the completion.
    const history = getDb()
      .prepare(
        'SELECT from_stage_id, to_stage_id, activity_id FROM lead_stage_history WHERE lead_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(leadId) as { from_stage_id: number; to_stage_id: number; activity_id: number }
    expect(history.from_stage_id).toBe(stageIdByName(organizationId, 'NEW'))
    expect(history.to_stage_id).toBe(stageIdByName(organizationId, 'CONTACTED'))
    expect(history.activity_id).toBeTruthy()

    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1) // the chosen activity only
    expect(activities[0].typeId).toBe(typeId)
  })

  it('auto-records a NOTE activity when a stageChange has no logged activity', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    completeFollowUp({
      followupId,
      notes: 'Interested in family plan',
      stageChange: {
        targetStageId: stageIdByName(organizationId, 'INTERESTED'),
        expectedStageId: stageIdByName(organizationId, 'NEW')
      }
    })

    const activities = activityRepo.listForLead(organizationId, leadId)
    expect(activities).toHaveLength(1)
    expect(activities[0].typeId).toBe(activityTypeId(organizationId, 'NOTE'))
    expect(activities[0].note).toContain('Interested in family plan')
  })

  it('completes with a stageChange that re-opens a LOST lead', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Win back call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    const reason = getDb()
      .prepare('SELECT id FROM lead_lost_reasons WHERE organization_id = ? LIMIT 1')
      .get(organizationId) as { id: number }
    markLeadLost({ leadId, lostReasonId: reason.id })

    completeFollowUp({
      followupId,
      notes: 'Convinced to return',
      stageChange: {
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: stageIdByName(organizationId, 'LOST')
      }
    })

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))
    expect(lead.lostReasonId).toBeNull()
    expect(lead.lostAt).toBeNull()
    const history = getDb()
      .prepare(
        'SELECT from_stage_id, to_stage_id FROM lead_stage_history WHERE lead_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(leadId) as { from_stage_id: number; to_stage_id: number }
    expect(history.from_stage_id).toBe(stageIdByName(organizationId, 'LOST'))
    expect(history.to_stage_id).toBe(stageIdByName(organizationId, 'CONTACTED'))
  })

  it('denies the stageChange without lead.update_stage', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    signInAs(organizationId, 'Front Desk')

    expect(() =>
      completeFollowUp({
        followupId,
        stageChange: {
          targetStageId: stageIdByName(organizationId, 'CONTACTED'),
          expectedStageId: stageIdByName(organizationId, 'NEW')
        }
      })
    ).toThrow(ForbiddenError)
  })

  it('rejects a stale optimistic concurrency token on the stageChange', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    expect(() =>
      completeFollowUp({
        followupId,
        stageChange: {
          targetStageId: stageIdByName(organizationId, 'CONTACTED'),
          expectedStageId: 99999
        }
      })
    ).toThrow(ConflictError)

    // The whole completion rolled back — the follow-up is still open.
    const followup = getDb()
      .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
      .get(followupId) as { completed_at: string | null }
    expect(followup.completed_at).toBeNull()
  })

  it('cancels other pending follow-ups when moving to a suppress-followups stage', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'First',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    const { followupId: otherId } = scheduleFollowUp({
      leadId,
      title: 'Second',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    completeFollowUp({
      followupId,
      stageChange: {
        targetStageId: stageIdByName(organizationId, 'DO_NOT_DISTURB'),
        expectedStageId: stageIdByName(organizationId, 'NEW')
      }
    })

    const other = getDb()
      .prepare('SELECT completed_at, cancelled_at, cancelled_reason FROM lead_followups WHERE id = ?')
      .get(otherId) as {
      completed_at: string | null
      cancelled_at: string | null
      cancelled_reason: string | null
    }
    expect(other.completed_at).toBeNull()
    expect(other.cancelled_at).not.toBeNull()
    expect(other.cancelled_reason).toBe(
      'Follow-up cancelled — lead moved to Do Not Disturb'
    )
  })

  it('ignores a second stageChange on an already-completed follow-up', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    completeFollowUp({
      followupId,
      stageChange: {
        targetStageId: stageIdByName(organizationId, 'CONTACTED'),
        expectedStageId: stageIdByName(organizationId, 'NEW')
      }
    })
    expect(() =>
      completeFollowUp({
        followupId,
        stageChange: {
          targetStageId: stageIdByName(organizationId, 'INTERESTED'),
          expectedStageId: stageIdByName(organizationId, 'NEW')
        }
      })
    ).not.toThrow()

    const lead = leadRepo.getById(organizationId, leadId)!
    expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))
  })

  it('bulk-completes open follow-ups and skips already-completed ones', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId: leadA } = createLeadFor(organizationId)
    const { leadId: leadB } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const doneId = scheduleFollowUp({ leadId: leadA, title: 'Done', dueAt: future }).followupId
    const fuA = scheduleFollowUp({ leadId: leadA, title: 'A', dueAt: future }).followupId
    const fuB = scheduleFollowUp({ leadId: leadB, title: 'B', dueAt: future }).followupId
    completeFollowUp({ followupId: doneId })

    const result = bulkCompleteFollowUps({ followUpIds: [doneId, fuA, fuB] })

    expect(result.completed).toBe(2)
    for (const id of [fuA, fuB]) {
      const followup = getDb()
        .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
        .get(id) as { completed_at: string | null }
      expect(followup.completed_at).not.toBeNull()
    }
    // No stage change, no activity side effects.
    expect(activityRepo.listForLead(organizationId, leadA)).toHaveLength(0)
  })

  it('moves each lead to the shared target atomically with an auto-NOTE', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId: leadA } = createLeadFor(organizationId)
    const { leadId: leadB } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const fuA = scheduleFollowUp({ leadId: leadA, title: 'A', dueAt: future }).followupId
    const fuB = scheduleFollowUp({ leadId: leadB, title: 'B', dueAt: future }).followupId

    const result = bulkCompleteFollowUps({
      followUpIds: [fuA, fuB],
      stageChange: { targetStageId: stageIdByName(organizationId, 'CONTACTED') }
    })

    expect(result.completed).toBe(2)
    for (const leadId of [leadA, leadB]) {
      const lead = leadRepo.getById(organizationId, leadId)!
      expect(lead.currentStageId).toBe(stageIdByName(organizationId, 'CONTACTED'))

      const activities = activityRepo.listForLead(organizationId, leadId)
      expect(activities).toHaveLength(1)
      expect(activities[0].typeId).toBe(activityTypeId(organizationId, 'NOTE'))
      expect(activities[0].note).toBe('Followup completed — moved to CONTACTED')

      const history = getDb()
        .prepare(
          'SELECT activity_id FROM lead_stage_history WHERE lead_id = ? AND from_stage_id = ? AND to_stage_id = ?'
        )
        .all(
          leadId,
          stageIdByName(organizationId, 'NEW'),
          stageIdByName(organizationId, 'CONTACTED')
        ) as { activity_id: number }[]
      expect(history).toHaveLength(1)
      expect(history[0].activity_id).toBeTruthy()
    }
  })

  it('denies the bulk stage change without lead.update_stage', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })
    signInAs(organizationId, 'Front Desk')

    expect(() =>
      bulkCompleteFollowUps({
        followUpIds: [followupId],
        stageChange: { targetStageId: stageIdByName(organizationId, 'CONTACTED') }
      })
    ).toThrow(ForbiddenError)
  })

  it('rolls back the whole batch when one lead cannot move', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId: ok } = createLeadFor(organizationId)
    const { leadId: bad } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const fuOk = scheduleFollowUp({ leadId: ok, title: 'Ok', dueAt: future }).followupId
    const fuBad = scheduleFollowUp({ leadId: bad, title: 'Bad', dueAt: future }).followupId
    // WON stays absorbing, so a WON lead cannot move and aborts the batch.
    leadRepo.updateCurrentStage(organizationId, bad, stageIdByName(organizationId, 'WON'))

    expect(() =>
      bulkCompleteFollowUps({
        followUpIds: [fuOk, fuBad],
        stageChange: { targetStageId: stageIdByName(organizationId, 'CONTACTED') }
      })
    ).toThrow(InvalidStateTransitionError)

    // Nothing from the batch committed — both follow-ups are still open.
    for (const id of [fuOk, fuBad]) {
      const followup = getDb()
        .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
        .get(id) as { completed_at: string | null }
      expect(followup.completed_at).toBeNull()
    }
    expect(leadRepo.getById(organizationId, ok)!.currentStageId).toBe(
      stageIdByName(organizationId, 'NEW')
    )
  })

  it('rejects a foreign target stage and rolls back', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const { followupId } = scheduleFollowUp({
      leadId,
      title: 'Call back',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    expect(() =>
      bulkCompleteFollowUps({
        followUpIds: [followupId],
        stageChange: { targetStageId: 99999 }
      })
    ).toThrow(NotFoundError)

    const followup = getDb()
      .prepare('SELECT completed_at FROM lead_followups WHERE id = ?')
      .get(followupId) as { completed_at: string | null }
    expect(followup.completed_at).toBeNull()
  })

  it('cancels sibling follow-ups for leads moved to a suppress-followups stage', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId: leadA } = createLeadFor(organizationId)
    const { leadId: leadB } = createLeadFor(organizationId)
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const fuA = scheduleFollowUp({ leadId: leadA, title: 'First', dueAt: future }).followupId
    const { followupId: siblingId } = scheduleFollowUp({
      leadId: leadA,
      title: 'Second',
      dueAt: future
    })
    const fuB = scheduleFollowUp({ leadId: leadB, title: 'B', dueAt: future }).followupId

    const result = bulkCompleteFollowUps({
      followUpIds: [fuA, fuB],
      stageChange: { targetStageId: stageIdByName(organizationId, 'DO_NOT_DISTURB') }
    })

    expect(result.completed).toBe(2)
    const sibling = getDb()
      .prepare('SELECT completed_at, cancelled_at, cancelled_reason FROM lead_followups WHERE id = ?')
      .get(siblingId) as {
      completed_at: string | null
      cancelled_at: string | null
      cancelled_reason: string | null
    }
    expect(sibling.completed_at).toBeNull()
    expect(sibling.cancelled_at).not.toBeNull()
    expect(sibling.cancelled_reason).toBe(
      'Follow-up cancelled — lead moved to Do Not Disturb'
    )
  })
})

describe('queries', () => {
  it('returns reference data after seeding', () => {
    seedOrgWithSession()
    const ref = getReferenceData()
    expect(ref.sources.length).toBeGreaterThan(0)
    expect(ref.stages.map((s) => s.name)).toContain('NEW')
    expect(ref.stages.filter((s) => s.isInitial)).toHaveLength(1)
    expect(ref.lostReasons.length).toBeGreaterThan(0)
    expect(ref.activityTypes.some((t) => t.name === 'OWNER_CHANGE')).toBe(true)
  })

  it('classifies new vs uncontacted leads', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)

    const contacted = createLead({ fullName: 'A', phone: '9111111111', sourceId })
    const typeId = activityTypeId(organizationId, 'WALK_IN')
    activityRepo.create({
      organizationId,
      leadId: contacted.leadId,
      typeId,
      note: 'contacted',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    createLead({ fullName: 'B', phone: '9222222222', sourceId })

    expect(getNewLeads()).toHaveLength(2)
    const uncontacted = getUncontactedLeads()
    expect(uncontacted).toHaveLength(1)
    expect(uncontacted[0].phone).toBe('9222222222')
  })

  it('returns funnel counts grouped by stage', () => {
    const { organizationId } = seedOrgWithSession()
    createLeadFor(organizationId)
    createLeadFor(organizationId)

    const counts = getFunnelCounts()
    expect(counts.find((c) => c.stageName === 'NEW')?.count).toBe(2)
  })

  it('returns lead details with derived status', () => {
    const { organizationId } = seedOrgWithSession()
    const { leadId, phone } = createLeadFor(organizationId)

    const details = getLeadDetails({ leadId })
    expect(details).toMatchObject({
      leadId,
      personName: 'Rahul Sharma',
      phone,
      sourceName: expect.any(String),
      stageName: 'NEW',
      status: 'OPEN',
      ownerName: 'Priya Verma'
    })
  })

  it('returns a timeline of activities, stage moves, and follow-ups', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)
    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'x',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId,
      targetStageId: stageIdByName(organizationId, 'CONTACTED'),
      expectedStageId: stageIdByName(organizationId, 'NEW'),
      activityId: activity.id
    })
    scheduleFollowUp({
      leadId,
      title: 'Re-call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    const kinds = getLeadTimeline({ leadId }).map((t) => t.kind)
    expect(kinds).toContain('activity')
    expect(kinds).toContain('stage')
    expect(kinds).toContain('followup')
  })

  it('scopes queries to the session organization', () => {
    const first = seedOrgWithSession()
    createLeadFor(first.organizationId)
    const second = seedOrgWithSession()
    createLeadFor(second.organizationId)

    expect(getNewLeads()).toHaveLength(1)
    const counts = getFunnelCounts()
    expect(counts.reduce((sum, c) => sum + c.count, 0)).toBe(1)
  })
})

describe('listLeads', () => {
  it('returns rows with nested activities, follow-ups, and stage history', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const { leadId } = createLeadFor(organizationId)

    const typeId = activityTypeId(organizationId, 'PHONE_CALL')
    const activity = activityRepo.create({
      organizationId,
      leadId,
      typeId,
      note: 'Called Rahul',
      occurredAt: new Date().toISOString(),
      createdBy: userId
    })
    moveLeadStage({
      leadId,
      targetStageId: stageIdByName(organizationId, 'CONTACTED'),
      expectedStageId: stageIdByName(organizationId, 'NEW'),
      activityId: activity.id
    })
    scheduleFollowUp({
      leadId,
      title: 'Re-call',
      dueAt: new Date(Date.now() + 86_400_000).toISOString()
    })

    const page = listLeads({ page: 1, limit: 50 })
    expect(page.total).toBe(1)
    expect(page.items).toHaveLength(1)
    const row = page.items[0]
    expect(row).toMatchObject({
      id: leadId,
      personName: 'Rahul Sharma',
      stageName: 'CONTACTED',
      isWon: false,
      isLost: false,
      ownerName: 'Priya Verma',
      sourceName: expect.any(String)
    })
    expect(row.activities).toHaveLength(1)
    expect(row.activities[0]).toMatchObject({
      typeName: 'PHONE_CALL',
      note: 'Called Rahul',
      createdByName: 'Priya Verma'
    })
    // The auto-created default follow-up from createLead plus the explicit one.
    expect(row.followUps).toHaveLength(2)
    const scheduled = row.followUps.find((f) => f.title === 'Re-call')
    expect(scheduled).toMatchObject({ title: 'Re-call', completedAt: null })
    expect(row.stageHistory).toHaveLength(2) // initial NEW + CONTACTED move
    expect(row.stageHistory[1]).toMatchObject({
      fromStageName: 'NEW',
      toStageName: 'CONTACTED'
    })
  })

  it('round-trips plan, goal, and notes in list rows', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const planId = planIdByName(organizationId, 'Quarterly')
    createLead({
      fullName: 'Neha',
      phone: '9333333333',
      sourceId,
      planId,
      goal: 'Muscle gain',
      notes: 'Prefers evening batch'
    })

    const row = listLeads({ page: 1, limit: 50 }).items[0]
    expect(row).toMatchObject({
      planId,
      planName: 'Quarterly',
      goal: 'Muscle gain',
      notes: 'Prefers evening batch'
    })
  })

  it('filters by stage, source, owner, and search', () => {
    const { organizationId, userId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const first = createLead({ fullName: 'Alpha', phone: '9111111111', sourceId })
    createLead({ fullName: 'Beta', phone: '9222222222', sourceId })
    assignLead({ leadId: first.leadId, ownerUserId: userId }) // no-op, already owner

    const newStage = stageIdByName(organizationId, 'NEW')
    expect(listLeads({ page: 1, limit: 50, stageId: newStage }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, sourceId }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, ownerUserId: userId }).total).toBe(2)
    expect(listLeads({ page: 1, limit: 50, search: 'Beta' }).total).toBe(1)
    expect(listLeads({ page: 1, limit: 50, search: 'does-not-exist' }).total).toBe(0)
  })

  it('paginates with hasMore', () => {
    const { organizationId } = seedOrgWithSession()
    createLeadFor(organizationId)
    createLeadFor(organizationId)
    createLeadFor(organizationId)

    const page = listLeads({ page: 1, limit: 2 })
    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(true)
    expect(page.total).toBe(3)

    const last = listLeads({ page: 2, limit: 2 })
    expect(last.items).toHaveLength(1)
    expect(last.hasMore).toBe(false)
  })

  it('throws PERMISSION_DENIED without lead.view', () => {
    seedOrgWithSession('Finance')
    expect(() => listLeads({ page: 1, limit: 50 })).toThrow(ForbiddenError)
  })
})

describe('searchLeadSources', () => {
  it('returns only active sources matching the query, ordered by sort order', () => {
    const { organizationId } = seedOrgWithSession()
    getDb()
      .prepare('UPDATE lead_sources SET active = 0 WHERE organization_id = ? AND name = ?')
      .run(organizationId, 'Instagram')

    // Deactivated sources never appear, even on a name match.
    expect(searchLeadSources({ query: 'insta' })).toEqual([])

    const all = searchLeadSources({ query: 'a' })
    expect(all.every((s) => s.active)).toBe(true)
    expect(all.map((s) => s.name)).not.toContain('Instagram')
  })

  it('matches case-insensitively and trims the query', () => {
    seedOrgWithSession()
    expect(searchLeadSources({ query: '  INSTAGRAM  ' })).toEqual([
      { id: expect.any(Number), name: 'Instagram', active: true }
    ])
  })

  it('throws PERMISSION_DENIED without lead.view', () => {
    seedOrgWithSession('Finance')
    expect(() => searchLeadSources({ query: 'walk' })).toThrow(ForbiddenError)
  })
})

describe('searchLeadPlans', () => {
  it('returns only active catalog plans matching the query, case-insensitively', () => {
    seedOrgWithSession()

    // The seeded catalog has exactly one active plan matching "annual".
    expect(searchLeadPlans({ query: 'annual' })).toEqual([
      { id: expect.any(Number), name: 'Annual' }
    ])
    expect(searchLeadPlans({ query: '  ANNUAL  ' })).toEqual([
      { id: expect.any(Number), name: 'Annual' }
    ])
    expect(searchLeadPlans({ query: 'weekend' })).toEqual([])
  })

  it('is scoped to the current organization', () => {
    const { organizationId: orgA } = seedOrgWithSession()
    const { organizationId: otherOrg } = seedOrgWithSession()
    getDb()
      .prepare(
        `INSERT INTO membership_plans (organization_id, name, duration, base_price_minor)
         VALUES (?, 'Couple Plan', 'MONTHLY', 250000)`
      )
      .run(otherOrg)

    signInAs(orgA, 'Owner')
    expect(searchLeadPlans({ query: 'couple' })).toEqual([])
    signInAs(otherOrg, 'Owner')
    expect(searchLeadPlans({ query: 'couple' })).toEqual([
      { id: expect.any(Number), name: 'Couple Plan' }
    ])
  })

  it('throws PERMISSION_DENIED without lead.view', () => {
    seedOrgWithSession('Finance')
    expect(() => searchLeadPlans({ query: 'a' })).toThrow(ForbiddenError)
  })
})

describe('searchLeadGoals', () => {
  it('returns distinct goal values used on this orgs leads, matching case-insensitively', () => {
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Asha', phone: '9876543210', sourceId, goal: 'Weight loss' })
    createLead({ fullName: 'Beena', phone: '9876543211', sourceId, goal: 'Muscle gain' })

    expect(searchLeadGoals({ query: '  WEIGHT  ' })).toEqual([
      { id: 'Weight loss', label: 'Weight loss' }
    ])
  })

  it('throws PERMISSION_DENIED without lead.view', () => {
    seedOrgWithSession('Finance')
    expect(() => searchLeadGoals({ query: 'a' })).toThrow(ForbiddenError)
  })
})

describe('createLeadSource', () => {
  it('creates a source with a trimmed name appended at the end of the sort order', () => {
    const { organizationId } = seedOrgWithSession()

    const created = createLeadSource({ name: '  Corporate Event  ' })

    expect(created).toEqual({ id: expect.any(Number), name: 'Corporate Event', active: true })
    const row = getDb()
      .prepare('SELECT name, sort_order, active FROM lead_sources WHERE id = ?')
      .get(created.id) as { name: string; sort_order: number; active: number }
    expect(row).toEqual({ name: 'Corporate Event', sort_order: 8, active: 1 })
    expect(row.sort_order).toBeGreaterThan(
      (
        getDb()
          .prepare(
            'SELECT MAX(sort_order) AS m FROM lead_sources WHERE id != ? AND organization_id = ?'
          )
          .get(created.id, organizationId) as { m: number }
      ).m
    )
  })

  it('computes the sort order per organization', () => {
    const { organizationId: orgB } = seedOrgWithSession()
    seedOrgWithSession()

    createLeadSource({ name: 'Podcast' })

    const bMax = getDb()
      .prepare('SELECT MAX(sort_order) AS m FROM lead_sources WHERE organization_id = ?')
      .get(orgB) as { m: number }
    expect(bMax.m).toBe(7)
  })

  it('rejects a duplicate name case-insensitively with ConflictError', () => {
    seedOrgWithSession()
    expect(() => createLeadSource({ name: 'instagram' })).toThrow(ConflictError)
  })

  it('rejects a whitespace-only name with ValidationError', () => {
    seedOrgWithSession()
    expect(() => createLeadSource({ name: '   ' })).toThrow(ValidationError)
  })

  it('denies creation without settings.manage even when lead.view is present', () => {
    seedOrgWithSession('Sales')
    expect(() => createLeadSource({ name: 'Podcast' })).toThrow(ForbiddenError)
  })
})

describe('checkLeadPersonAvailability', () => {
  it('reports no matches for a phone number not used by any person', () => {
    seedOrgWithSession()
    expect(checkLeadPersonAvailability({ fullName: 'New Person', phone: '9888777666' })).toEqual({
      phoneTaken: false,
      sameNamedPerson: false,
      matchedPerson: null,
      emailTaken: false,
      emailOwnerName: null
    })
  })

  it('finds an existing person whose phone matches, reports same name when names align', () => {
    seedOrgWithSession()
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Rahul Sharma', phone: '9876543210', sourceId })

    const result = checkLeadPersonAvailability({
      fullName: 'Rahul Sharma',
      phone: '9876543210'
    })

    expect(result.phoneTaken).toBe(true)
    expect(result.sameNamedPerson).toBe(true)
    expect(result.matchedPerson).toMatchObject({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      isBlacklisted: false
    })
  })

  it('detects a name mismatch on a taken phone', () => {
    seedOrgWithSession()
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Rahul Sharma', phone: '9876543210', sourceId })

    const result = checkLeadPersonAvailability({
      fullName: 'Neha Kapoor',
      phone: '9876543210'
    })

    expect(result.phoneTaken).toBe(true)
    expect(result.sameNamedPerson).toBe(false)
    expect(result.matchedPerson).toMatchObject({ fullName: 'Rahul Sharma' })
  })

  it('normalizes whitespace and case when comparing names', () => {
    seedOrgWithSession()
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({ fullName: 'Priya Verma', phone: '9876543211', sourceId })

    const result = checkLeadPersonAvailability({
      fullName: '  priya   VERMA ',
      phone: '9876543211'
    })

    expect(result.phoneTaken).toBe(true)
    expect(result.sameNamedPerson).toBe(true)
  })

  it('ignores the excluded person (edit dialog scenario)', () => {
    seedOrgWithSession()
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    const { personId } = createLead({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      sourceId
    })

    const result = checkLeadPersonAvailability({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      excludePersonId: personId
    })

    expect(result.phoneTaken).toBe(false)
    expect(result.sameNamedPerson).toBe(false)
    expect(result.matchedPerson).toBeNull()
  })

  it('warns when email belongs to a different person', () => {
    seedOrgWithSession()
    const { organizationId } = seedOrgWithSession()
    const sourceId = createSourceId(organizationId)
    createLead({
      fullName: 'Rahul Sharma',
      phone: '9876543210',
      sourceId,
      email: 'rahul@test.com'
    })

    const result = checkLeadPersonAvailability({
      fullName: 'Neha Kapoor',
      phone: '9876543211',
      email: 'rahul@test.com'
    })

    expect(result.phoneTaken).toBe(false)
    expect(result.emailTaken).toBe(true)
    expect(result.emailOwnerName).toBe('Rahul Sharma')
  })

  it('treats an invalid phone as all-clear (no block, no warning)', () => {
    seedOrgWithSession()
    const result = checkLeadPersonAvailability({
      fullName: 'Test',
      phone: 'not-a-phone'
    })

    expect(result).toEqual({
      phoneTaken: false,
      sameNamedPerson: false,
      matchedPerson: null,
      emailTaken: false,
      emailOwnerName: null
    })
  })

  it('denies access without lead.view permission', () => {
    seedOrgWithSession('Finance')
    expect(() =>
      checkLeadPersonAvailability({ fullName: 'Test', phone: '9876543210' })
    ).toThrow(ForbiddenError)
  })
})
