import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { PaymentRecord } from './types'

const keys = {
  all: ['collections'] as const,
  list: () => [...keys.all, 'list'] as const,
  one: (id: string) => [...keys.all, 'one', id] as const
}

/** The full payment ledger, latest recorded first. */
export function usePayments(): UseQueryResult<PaymentRecord[], Error> {
  return useQuery({
    queryKey: keys.list(),
    queryFn: () => api.payments()
  })
}

/** A single payment record for the details drawer. */
export function usePayment(
  id: string | undefined
): UseQueryResult<PaymentRecord | undefined, Error> {
  return useQuery({
    queryKey: keys.one(id ?? ''),
    queryFn: () => api.payment(id!),
    enabled: !!id
  })
}
