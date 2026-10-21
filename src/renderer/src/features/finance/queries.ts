import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import type { PersonRef } from '@/features/dashboard/types'
import { toast } from 'sonner'
import { api } from './api'
import type { Credit, FinanceInvoice, Payment, Refund } from './types'

const financeKeys = {
  all: ['finance'] as const,
  payments: () => [...financeKeys.all, 'payments'] as const,
  refunds: () => [...financeKeys.all, 'refunds'] as const,
  credits: () => [...financeKeys.all, 'credits'] as const,
  invoices: () => [...financeKeys.all, 'invoices'] as const,
  customers: () => [...financeKeys.all, 'customers'] as const
}

export function useCustomers(): UseQueryResult<PersonRef[], Error> {
  return useQuery({ queryKey: financeKeys.customers(), queryFn: () => api.customers() })
}

/** Outstanding invoices for a customer, for the allocation step of a payment. */
export function useOutstandingInvoices(
  customerId: string | undefined
): UseQueryResult<FinanceInvoice[], Error> {
  return useQuery({
    queryKey: [...financeKeys.invoices(), 'outstanding', customerId ?? ''],
    queryFn: () => api.outstandingInvoicesFor(customerId!),
    enabled: !!customerId
  })
}

/** Payments recorded against a customer, for the refund source picker. */
export function usePaymentsFor(customerId: string | undefined): UseQueryResult<Payment[], Error> {
  return useQuery({
    queryKey: [...financeKeys.payments(), 'for', customerId ?? ''],
    queryFn: () => api.paymentsFor(customerId!),
    enabled: !!customerId
  })
}

export function usePayments(): UseQueryResult<Payment[], Error> {
  return useQuery({ queryKey: financeKeys.payments(), queryFn: () => api.payments() })
}

export function useRefunds(): UseQueryResult<Refund[], Error> {
  return useQuery({ queryKey: financeKeys.refunds(), queryFn: () => api.refunds() })
}

/** Issues any scheduled refunds whose cancellation date has arrived. */
export function useProcessScheduledRefunds(): UseMutationResult<{ issued: number }, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.processScheduledRefunds(),
    onSuccess: (result) => {
      if (result.issued > 0) {
        qc.invalidateQueries({ queryKey: financeKeys.all })
      }
    }
  })
}

export function useCredits(): UseQueryResult<Credit[], Error> {
  return useQuery({ queryKey: financeKeys.credits(), queryFn: () => api.credits() })
}

export function useInvoices(): UseQueryResult<FinanceInvoice[], Error> {
  return useQuery({ queryKey: financeKeys.invoices(), queryFn: () => api.invoices() })
}

/**
 * Generic finance mutation: invalidate every finance query on success so the
 * read models (tables, metrics and reports) re-derive from the same records.
 */
function useFinanceMutation<TInput, TResult>(
  mutator: (input: TInput) => Promise<TResult>,
  successMessage: string
): UseMutationResult<TResult, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: financeKeys.all })
      toast.success(successMessage)
      void result
    },
    onError: (e) => toast.error('Something went wrong', { description: e.message })
  })
}

export function useRecordPayment(): UseMutationResult<Payment, Error, Record<string, unknown>> {
  return useFinanceMutation((input) => api.recordPayment(input as never), 'Payment recorded')
}

export function useIssueRefund(): UseMutationResult<Refund, Error, Record<string, unknown>> {
  return useFinanceMutation((input) => api.issueRefund(input as never), 'Refund issued')
}

export function useIssueCredit(): UseMutationResult<Credit, Error, Record<string, unknown>> {
  return useFinanceMutation((input) => api.issueCredit(input as never), 'Credit added')
}
