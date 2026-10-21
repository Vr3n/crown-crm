import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
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
  CreatedLead,
  DeleteLeadsInput,
  EditLeadInput,
  LeadPersonAvailability,
  MarkLeadLostInput,
  MoveLeadStageInput,
  RecordLeadActivityInput,
  RecordedActivity,
  ScheduleFollowUpInput,
  UpdateFollowUpInput
} from '../../../../shared/contracts/sales'
import { errorMessage } from '../../../../shared/contracts/errors'
import { api } from './api'
import { mapLeadRow } from './mapping'
import type { Lead } from './types'

const leadKeys = {
  all: ['leads'] as const,
  list: () => [...leadKeys.all, 'list'] as const
}

/**
 * Reactive duplicate probe for the lead dialogs (docs/107). `input` is `undefined`
 * until the form values are complete enough to judge; the enclosed forms debounce
 * name/phone/email before enabling it, so one IPC round trip per pause.
 */
export function useLeadPersonAvailability(
  input: CheckLeadPersonInput | undefined
): UseQueryResult<LeadPersonAvailability, Error> {
  return useQuery({
    queryKey: ['leads', 'person-availability', input],
    queryFn: () => api.checkPerson(input as CheckLeadPersonInput),
    enabled: Boolean(input),
    retry: false,
    staleTime: 1000,
    refetchOnWindowFocus: false
  })
}

/**
 * The whole Leads feature renders from this single query: the pipeline list
 * (capped at 200 rows; sorting/filtering stays client-side) hydrated into the
 * display model. Reference data is fetched separately by `useReferenceData`,
 * which TanStack dedupes for the forms.
 */
export const leadsListOptions = queryOptions({
  queryKey: leadKeys.list(),
  queryFn: async () => {
    const res = await api.list({ page: 1, limit: 200 })
    return res.items.map(mapLeadRow)
  },
  staleTime: 30_000,
  retry: 2,
  refetchOnWindowFocus: true,
  refetchOnMount: true
})

export function useLeads(): UseQueryResult<Lead[], Error> {
  return useQuery(leadsListOptions)
}

/**
 * Detail read from the shared list cache — no separate round-trip. The query is
 * disabled until an id is known, and selects the row so mutations that
 * invalidate `['leads']` refresh the detail automatically.
 */
export function useLead(id: number | undefined): UseQueryResult<Lead | undefined, Error> {
  return useQuery({
    ...leadsListOptions,
    select: (leads) => (id === undefined ? undefined : leads.find((l) => l.id === id)),
    enabled: id !== undefined
  })
}

/**
 * Generic lead mutation: invalidate the list cache on success so every derived
 * read model (table, board, detail, follow-ups, activities) re-derives from one
 * source of truth. Errors surface the backend message when available.
 */
function useLeadMutation<TInput, TResult>(
  mutator: (input: TInput) => Promise<TResult>,
  successMessage: string,
  fallbackError: string,
  invalidateOnError = false,
  notifyOnError = true
): UseMutationResult<TResult, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: leadKeys.all })
      toast.success(successMessage)
      void result
    },
    onError: (e) => {
      if (invalidateOnError) qc.invalidateQueries({ queryKey: leadKeys.all })
      if (notifyOnError) toast.error(errorMessage(e, fallbackError))
    }
  })
}

export function useCreateLead(): UseMutationResult<CreatedLead, Error, CreateLeadInput> {
  // The create dialog surfaces errors inline (like the auth forms), so skip the toast.
  return useLeadMutation(
    (input) => api.create(input),
    'Lead created',
    'Could not create lead',
    false,
    false
  )
}

export function useEditLead(): UseMutationResult<void, Error, EditLeadInput> {
  return useLeadMutation((input) => api.editLead(input), 'Lead updated', 'Could not update lead')
}

export function useMoveStage(): UseMutationResult<void, Error, MoveLeadStageInput> {
  // A concurrent-change CONFLICT leaves the cached list stale, so refresh it too.
  return useLeadMutation(
    (input) => api.moveStage(input),
    'Stage updated',
    'Could not move stage',
    true
  )
}

export function useBulkMoveStage(): UseMutationResult<
  BulkMoveLeadStageResult,
  Error,
  BulkMoveLeadStageInput
> {
  return useLeadMutation(
    (input) => api.bulkMoveStage(input),
    'Leads moved',
    'Could not move leads',
    true
  )
}

export function useBulkScheduleFollowUp(): UseMutationResult<
  BulkScheduleFollowUpResult,
  Error,
  BulkScheduleFollowUpInput
> {
  return useLeadMutation(
    (input) => api.bulkScheduleFollowUp(input),
    'Follow-ups scheduled',
    'Could not schedule follow-ups',
    true
  )
}

export function useBulkRecordActivity(): UseMutationResult<
  BulkRecordActivityResult,
  Error,
  BulkRecordActivityInput
> {
  return useLeadMutation(
    (input) => api.bulkRecordActivity(input),
    'Activities logged',
    'Could not log activities',
    true
  )
}

export function useDeleteLeads(): UseMutationResult<void, Error, DeleteLeadsInput> {
  return useLeadMutation(
    (input) => api.deleteLeads(input),
    'Leads deleted',
    'Could not delete leads'
  )
}

export function useLogActivity(): UseMutationResult<
  RecordedActivity,
  Error,
  RecordLeadActivityInput
> {
  return useLeadMutation(
    (input) => api.logActivity(input),
    'Activity logged',
    'Could not log activity'
  )
}

export function useMarkLost(): UseMutationResult<void, Error, MarkLeadLostInput> {
  return useLeadMutation((input) => api.markLost(input), 'Lead marked lost', 'Could not mark lost')
}

export function useScheduleFollowUp(): UseMutationResult<
  { followupId: number },
  Error,
  ScheduleFollowUpInput
> {
  return useLeadMutation(
    (input) => api.scheduleFollowUp(input),
    'Follow-up scheduled',
    'Could not schedule follow-up'
  )
}

export function useCompleteFollowUp(): UseMutationResult<void, Error, CompleteFollowUpInput> {
  return useLeadMutation(
    (input) => api.completeFollowUp(input),
    'Follow-up done',
    'Could not complete follow-up'
  )
}

export function useBulkCompleteFollowUps(): UseMutationResult<
  BulkCompleteFollowUpsResult,
  Error,
  BulkCompleteFollowUpsInput
> {
  return useLeadMutation(
    (input) => api.bulkCompleteFollowUps(input),
    'Follow-ups completed',
    'Could not complete follow-ups',
    true
  )
}

export function useUpdateFollowUp(): UseMutationResult<void, Error, UpdateFollowUpInput> {
  return useLeadMutation(
    (input) => api.updateFollowUp(input),
    'Follow-up extended',
    'Could not update follow-up'
  )
}

export function useCancelFollowUp(): UseMutationResult<void, Error, CancelFollowUpInput> {
  return useLeadMutation(
    (input) => api.cancelFollowUp(input),
    'Follow-up cancelled',
    'Could not cancel follow-up'
  )
}
