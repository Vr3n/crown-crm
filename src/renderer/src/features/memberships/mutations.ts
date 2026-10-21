import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { membershipApi } from './api'
import type {
  CancelMembershipInput,
  CancelMembershipResult,
  MembershipRefundState,
  RevertCancellationInput,
  RenewMembershipInput,
  RenewMembershipResult
} from '../../../../shared/contracts/membership-cancel-renew'

export function useCancelMembership(): UseMutationResult<
  CancelMembershipResult,
  unknown,
  CancelMembershipInput,
  unknown
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CancelMembershipInput) => membershipApi.cancel(input),
    onSuccess: (data: CancelMembershipResult) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['refunds'] })
      const refundNote = data.refundIssued
        ? ` · Refund ₹${(data.refundAmountMinor / 100).toFixed(2)}`
        : data.refundScheduled
          ? ` · Refund ₹${(data.refundAmountMinor / 100).toFixed(2)} scheduled for ${data.effectiveDate}`
          : ''
      toast.success(
        `${data.status === 'CANCELLED' ? 'Membership cancelled' : 'Cancellation requested'} — effective ${data.effectiveDate}${refundNote}`
      )
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not cancel membership'
      toast.error(msg)
    }
  })
}

export function useRevertCancellation(): UseMutationResult<
  void,
  unknown,
  RevertCancellationInput,
  unknown
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RevertCancellationInput) => membershipApi.undoCancellation(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
      toast.success('Cancellation reverted')
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not revert cancellation'
      toast.error(msg)
    }
  })
}

export function useRenewMembership(): UseMutationResult<
  RenewMembershipResult,
  unknown,
  RenewMembershipInput,
  unknown
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RenewMembershipInput) => membershipApi.renew(input),
    onSuccess: (data: RenewMembershipResult) => {
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['memberships'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['refunds'] })
      toast.success(`Membership renewed — ${data.invoiceNumber}`, {
        description: `Invoice ${data.invoiceNumber}`
      })
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'Could not renew membership'
      toast.error(msg)
    }
  })
}

export function useRefundState(
  membershipId: number | undefined
): UseQueryResult<MembershipRefundState, Error> {
  return useQuery({
    queryKey: ['membershipRefundState', membershipId],
    queryFn: () => membershipApi.refundState({ membershipId: membershipId! }),
    enabled: !!membershipId
  })
}
