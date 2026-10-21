import {
  assignLead,
  bulkCompleteFollowUps,
  bulkMoveLeadStage,
  bulkRecordActivity,
  bulkScheduleFollowUp,
  cancelFollowUp,
  checkLeadPersonAvailability,
  completeFollowUp,
  createLead,
  createLeadSource,
  deleteLeads,
  editLead,
  getFunnelCounts,
  getLeadDetails,
  getLeadTimeline,
  getNewLeads,
  getOverdueFollowups,
  getRecentlyLost,
  getRecentlyWon,
  getReferenceData,
  getTodaysFollowups,
  getTrialsEnding,
  getUncontactedLeads,
  listLeads,
  markLeadLost,
  moveLeadStage,
  recordLeadActivity,
  scheduleFollowUp,
  searchLeadGoals,
  searchLeadPlans,
  searchLeadSources,
  searchPeople,
  updateFollowUp
} from '../application/leads'
import {
  assignLeadInputSchema,
  bulkCompleteFollowUpsInputSchema,
  bulkMoveLeadStageInputSchema,
  bulkRecordActivityInputSchema,
  bulkScheduleFollowUpInputSchema,
  cancelFollowUpInputSchema,
  checkLeadPersonInputSchema,
  completeFollowUpInputSchema,
  createLeadInputSchema,
  createLeadSourceInputSchema,
  deleteLeadsInputSchema,
  editLeadInputSchema,
  leadIdRequestSchema,
  leadListRequestSchema,
  leadSourceSearchRequestSchema,
  leadVocabularySearchRequestSchema,
  markLeadLostInputSchema,
  moveLeadStageInputSchema,
  planSearchRequestSchema,
  recordLeadActivityInputSchema,
  scheduleFollowUpInputSchema,
  updateFollowUpInputSchema
} from '../../shared/contracts/sales'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerSalesIpc(): void {
  handle(IPC_CHANNELS.LEADS_CREATE, createLeadInputSchema, (input) => createLead(input))
  handle(IPC_CHANNELS.LEADS_EDIT, editLeadInputSchema, (input) => editLead(input))
  handle(IPC_CHANNELS.LEADS_MOVE_STAGE, moveLeadStageInputSchema, (input) => moveLeadStage(input))
  handle(IPC_CHANNELS.LEADS_DELETE, deleteLeadsInputSchema, (input) => deleteLeads(input))
  handle(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE, bulkMoveLeadStageInputSchema, (input) =>
    bulkMoveLeadStage(input)
  )
  handle(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP, bulkScheduleFollowUpInputSchema, (input) =>
    bulkScheduleFollowUp(input)
  )
  handle(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY, bulkRecordActivityInputSchema, (input) =>
    bulkRecordActivity(input)
  )
  handle(IPC_CHANNELS.LEADS_RECORD_ACTIVITY, recordLeadActivityInputSchema, (input) =>
    recordLeadActivity(input)
  )
  handle(IPC_CHANNELS.LEADS_ASSIGN, assignLeadInputSchema, (input) => assignLead(input))
  handle(IPC_CHANNELS.LEADS_MARK_LOST, markLeadLostInputSchema, (input) => markLeadLost(input))
  handle(IPC_CHANNELS.LEADS_SCHEDULE_FOLLOWUP, scheduleFollowUpInputSchema, (input) =>
    scheduleFollowUp(input)
  )
  handle(IPC_CHANNELS.LEADS_COMPLETE_FOLLOWUP, completeFollowUpInputSchema, (input) =>
    completeFollowUp(input)
  )
  handle(IPC_CHANNELS.LEADS_BULK_COMPLETE_FOLLOWUPS, bulkCompleteFollowUpsInputSchema, (input) =>
    bulkCompleteFollowUps(input)
  )
  handle(IPC_CHANNELS.LEADS_UPDATE_FOLLOWUP, updateFollowUpInputSchema, (input) =>
    updateFollowUp(input)
  )
  handle(IPC_CHANNELS.LEADS_CANCEL_FOLLOWUP, cancelFollowUpInputSchema, (input) =>
    cancelFollowUp(input)
  )

  handle(IPC_CHANNELS.LEADS_GET_DETAILS, leadIdRequestSchema, (input) => getLeadDetails(input))
  handle(IPC_CHANNELS.LEADS_LIST, leadListRequestSchema, (input) => listLeads(input))
  handle(IPC_CHANNELS.LEADS_GET_TIMELINE, leadIdRequestSchema, (input) => getLeadTimeline(input))
  handle(IPC_CHANNELS.LEADS_GET_NEW, () => getNewLeads())
  handle(IPC_CHANNELS.LEADS_GET_UNCONTACTED, () => getUncontactedLeads())
  handle(IPC_CHANNELS.LEADS_GET_TODAYS_FOLLOWUPS, () => getTodaysFollowups())
  handle(IPC_CHANNELS.LEADS_GET_OVERDUE_FOLLOWUPS, () => getOverdueFollowups())
  handle(IPC_CHANNELS.LEADS_GET_TRIALS_ENDING, () => getTrialsEnding())
  handle(IPC_CHANNELS.LEADS_GET_RECENT_WON, () => getRecentlyWon())
  handle(IPC_CHANNELS.LEADS_GET_RECENT_LOST, () => getRecentlyLost())
  handle(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS, () => getFunnelCounts())
  handle(IPC_CHANNELS.LEADS_SEARCH_PEOPLE, (query: string) => searchPeople(query))
  handle(IPC_CHANNELS.LEADS_CHECK_PERSON, checkLeadPersonInputSchema, (input) =>
    checkLeadPersonAvailability(input)
  )
  handle(IPC_CHANNELS.LEADS_GET_REFERENCE, () => getReferenceData())
  handle(IPC_CHANNELS.LEADS_SEARCH_SOURCES, leadSourceSearchRequestSchema, (input) =>
    searchLeadSources(input)
  )
  handle(IPC_CHANNELS.LEADS_CREATE_SOURCE, createLeadSourceInputSchema, (input) =>
    createLeadSource(input)
  )
  handle(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS, planSearchRequestSchema, (input) =>
    searchLeadPlans(input)
  )
  handle(IPC_CHANNELS.LEADS_SEARCH_GOALS, leadVocabularySearchRequestSchema, (input) =>
    searchLeadGoals(input)
  )
}
