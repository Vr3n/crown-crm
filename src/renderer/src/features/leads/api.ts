import type {
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
  LeadListRequest,
  LeadListResponse,
  LeadPersonAvailability,
  LeadSourceRow,
  LeadTextOptionRow,
  MarkLeadLostInput,
  MoveLeadStageInput,
  PlanOptionRow,
  RecordLeadActivityInput,
  RecordedActivity,
  ReferenceData,
  ScheduleFollowUpInput,
  UpdateFollowUpInput
} from '../../../../shared/contracts/sales'

/**
 * Thin IPC facade for the leads surface. Every method delegates to the preload
 * bridge (`window.api.leads.*`), which unwraps the `{ ok, data | error }`
 * envelope and re-throws `ApiError` carrying a stable machine-readable code —
 * so renderers branch on `error.code`, never on messages.
 */
export const api = {
  list: (input: LeadListRequest): Promise<LeadListResponse> => window.api.leads.list(input),
  create: (input: CreateLeadInput): Promise<CreatedLead> => window.api.leads.create(input),
  editLead: (input: EditLeadInput): Promise<void> => window.api.leads.editLead(input),
  moveStage: (input: MoveLeadStageInput): Promise<void> => window.api.leads.moveStage(input),
  deleteLeads: (input: DeleteLeadsInput): Promise<void> => window.api.leads.deleteLeads(input),
  bulkMoveStage: (input: BulkMoveLeadStageInput): Promise<BulkMoveLeadStageResult> =>
    window.api.leads.bulkMoveStage(input),
  bulkScheduleFollowUp: (input: BulkScheduleFollowUpInput): Promise<BulkScheduleFollowUpResult> =>
    window.api.leads.bulkScheduleFollowup(input),
  bulkRecordActivity: (input: BulkRecordActivityInput): Promise<BulkRecordActivityResult> =>
    window.api.leads.bulkRecordActivity(input),
  logActivity: (input: RecordLeadActivityInput): Promise<RecordedActivity> =>
    window.api.leads.recordActivity(input),
  markLost: (input: MarkLeadLostInput): Promise<void> => window.api.leads.markLost(input),
  scheduleFollowUp: (input: ScheduleFollowUpInput): Promise<{ followupId: number }> =>
    window.api.leads.scheduleFollowup(input),
  completeFollowUp: (input: CompleteFollowUpInput): Promise<void> =>
    window.api.leads.completeFollowup(input),
  bulkCompleteFollowUps: (
    input: BulkCompleteFollowUpsInput
  ): Promise<BulkCompleteFollowUpsResult> => window.api.leads.bulkCompleteFollowups(input),
  updateFollowUp: (input: UpdateFollowUpInput): Promise<void> =>
    window.api.leads.updateFollowup(input),
  cancelFollowUp: (input: CancelFollowUpInput): Promise<void> =>
    window.api.leads.cancelFollowup(input),
  referenceData: (): Promise<ReferenceData> => window.api.leads.getReferenceData(),
  searchSources: (query: string): Promise<LeadSourceRow[]> => window.api.leads.searchSources(query),
  createSource: (input: CreateLeadSourceInput): Promise<LeadSourceRow> =>
    window.api.leads.createSource(input),
  checkPerson: (input: CheckLeadPersonInput): Promise<LeadPersonAvailability> =>
    window.api.leads.checkPerson(input),
  searchPlanInterests: (query: string): Promise<PlanOptionRow[]> =>
    window.api.leads.searchPlanInterests(query),
  searchGoals: (query: string): Promise<LeadTextOptionRow[]> => window.api.leads.searchGoals(query)
}
