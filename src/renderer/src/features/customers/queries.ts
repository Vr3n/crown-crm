import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { Customer } from './types'

const customerKeys = {
  all: ['customers'] as const,
  list: () => [...customerKeys.all, 'list'] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const
}

export function useCustomers(): UseQueryResult<Customer[], Error> {
  return useQuery({ queryKey: customerKeys.list(), queryFn: () => api.list() })
}

export function useCustomer(id: string | undefined): UseQueryResult<Customer | undefined, Error> {
  return useQuery({
    queryKey: customerKeys.detail(id ?? ''),
    queryFn: () => api.get(id!),
    enabled: !!id
  })
}
