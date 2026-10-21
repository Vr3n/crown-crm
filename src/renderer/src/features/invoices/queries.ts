import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, invoiceCommands } from './api'
import type {
  AddInvoiceLineInput,
  FinalizeInvoiceInput,
  InvoiceDetail,
  InvoiceNumberPreview,
  MarkUncollectibleInput,
  RemoveInvoiceLineInput,
  UpdateBillingSnapshotInput,
  VoidInvoiceInput
} from '../../../../shared/contracts/billing'
import type { Invoice, InvoiceStatus } from './types'

const keys = {
  all: ['invoices'] as const,
  list: () => [...keys.all, 'list'] as const,
  one: (id: string) => [...keys.all, 'one', id] as const,
  byStatus: (status: InvoiceStatus | undefined) =>
    [...keys.all, 'status', status ?? 'all'] as const,
  /** Transactional draft detail (billing:getInvoice) keyed by the numeric row id. */
  draft: (invoiceId: number) => [...keys.all, 'draft', invoiceId] as const,
  nextNumber: () => [...keys.all, 'next-number'] as const
}

/** The full invoice register, newest issued first. */
export function useInvoices(): UseQueryResult<Invoice[], Error> {
  return useQuery({
    queryKey: keys.list(),
    queryFn: () => api.invoices()
  })
}

/** A single invoice record for the details drawer. */
export function useInvoice(id: string | undefined): UseQueryResult<Invoice | undefined, Error> {
  return useQuery({
    queryKey: keys.one(id ?? ''),
    queryFn: () => api.invoice(id!),
    enabled: !!id
  })
}

export function useInvoicesByStatus(
  status: InvoiceStatus | undefined
): UseQueryResult<Invoice[], Error> {
  return useQuery({
    queryKey: keys.byStatus(status),
    queryFn: () => api.invoicesByStatus(status)
  })
}

/* -------------------------------------------------------------------------- */
/* Draft lifecycle (Module 04 commands via billing:getInvoice)                 */
/* -------------------------------------------------------------------------- */

/** The transactional invoice + lines for a DRAFT being edited in the dialog. */
export function useDraftInvoice(
  invoiceId: number | undefined
): UseQueryResult<InvoiceDetail, Error> {
  return useQuery({
    queryKey: keys.draft(invoiceId ?? 0),
    queryFn: async () => await invoiceCommands.detail(invoiceId!),
    enabled: !!invoiceId
  })
}

/**
 * Display-only preview of the next invoice number. Long-ish staleTime is fine —
 * it is cosmetic and never reserved; finalize re-reads it authoritatively.
 * Pass the picked issue date so the preview follows the billing date (#110).
 */
export function useNextInvoiceNumber(
  enabled = false,
  issueDate?: string
): UseQueryResult<InvoiceNumberPreview, Error> {
  return useQuery({
    queryKey: [...keys.nextNumber(), issueDate ?? 'today'],
    queryFn: () => invoiceCommands.nextNumber(issueDate ? { issueDate } : undefined),
    enabled,
    staleTime: 30_000
  })
}

function useBillingMutation<TInput>(
  mutator: (input: TInput) => Promise<unknown>,
  successMessage: string
): UseMutationResult<unknown, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.all })
      toast.success(successMessage)
    },
    onError: (e) => toast.error('Something went wrong', { description: e.message })
  })
}

export function useCreateInvoice(): UseMutationResult<unknown, Error, number> {
  return useMutation({ mutationFn: (customerId: number) => invoiceCommands.create({ customerId }) })
}

export function useAddInvoiceLine(
  draftId: number | undefined
): UseMutationResult<unknown, Error, AddInvoiceLineInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddInvoiceLineInput) => invoiceCommands.addLine(input),
    onSuccess: () => {
      if (draftId !== undefined) void qc.invalidateQueries({ queryKey: keys.draft(draftId) })
      void qc.invalidateQueries({ queryKey: keys.list() })
    },
    onError: (e) => toast.error('Could not add line', { description: e.message })
  })
}

export function useRemoveInvoiceLine(
  draftId: number | undefined
): UseMutationResult<void, Error, RemoveInvoiceLineInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RemoveInvoiceLineInput) => invoiceCommands.removeLine(input),
    onSuccess: () => {
      if (draftId !== undefined) void qc.invalidateQueries({ queryKey: keys.draft(draftId) })
      void qc.invalidateQueries({ queryKey: keys.list() })
    },
    onError: (e) => toast.error('Could not remove line', { description: e.message })
  })
}

export function useFinalizeInvoice(): UseMutationResult<unknown, Error, FinalizeInvoiceInput> {
  return useBillingMutation(
    (input: FinalizeInvoiceInput) => invoiceCommands.finalize(input),
    'Invoice finalized'
  )
}

export function useVoidInvoice(): UseMutationResult<unknown, Error, VoidInvoiceInput> {
  return useBillingMutation(
    (input: VoidInvoiceInput) => invoiceCommands.void(input),
    'Invoice voided'
  )
}

export function useMarkUncollectible(): UseMutationResult<unknown, Error, MarkUncollectibleInput> {
  return useBillingMutation(
    (input: MarkUncollectibleInput) => invoiceCommands.markUncollectible(input),
    'Invoice marked uncollectible'
  )
}

export function useUpdateBillingSnapshot(
  draftId?: number
): UseMutationResult<unknown, Error, UpdateBillingSnapshotInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateBillingSnapshotInput) => invoiceCommands.updateSnapshot(input),
    onSuccess: () => {
      if (draftId !== undefined) void qc.invalidateQueries({ queryKey: keys.draft(draftId) })
      void qc.invalidateQueries({ queryKey: keys.all })
      toast.success('Billing details saved')
    },
    onError: (e) => toast.error('Could not save details', { description: e.message })
  })
}
