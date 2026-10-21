import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { MemberRecord, MembershipExpiration, PaymentDue } from './types'

const dashboardKeys = {
  all: ['dashboard'] as const,
  expirations: () => [...dashboardKeys.all, 'expirations'] as const,
  paymentsDue: () => [...dashboardKeys.all, 'payments-due'] as const,
  memberRecord: (id: string) => [...dashboardKeys.all, 'member-record', id] as const,
  paymentRecord: (id: string) => [...dashboardKeys.all, 'payment-record', id] as const
}

/** Memberships ordered by expiration, soonest first. */
export function useUpcomingExpirations(): UseQueryResult<MembershipExpiration[], Error> {
  return useQuery({
    queryKey: dashboardKeys.expirations(),
    queryFn: () => api.upcomingExpirations()
  })
}

/** Unpaid obligations ordered by amount due, largest first. */
export function usePaymentsDue(): UseQueryResult<PaymentDue[], Error> {
  return useQuery({
    queryKey: dashboardKeys.paymentsDue(),
    queryFn: () => api.paymentsDue()
  })
}

/** Full member record (lead + invoices) for the record drawer. */
export function useMemberRecord(
  id: string | undefined
): UseQueryResult<MemberRecord | undefined, Error> {
  return useQuery({
    queryKey: dashboardKeys.memberRecord(id ?? ''),
    queryFn: () => api.memberRecord(id!),
    enabled: !!id
  })
}

/** Member record for a payment due (membership + billing history, no lead). */
export function usePaymentRecord(
  id: string | undefined
): UseQueryResult<MemberRecord | undefined, Error> {
  return useQuery({
    queryKey: dashboardKeys.paymentRecord(id ?? ''),
    queryFn: () => api.paymentRecord(id!),
    enabled: !!id
  })
}
