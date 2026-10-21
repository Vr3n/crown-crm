import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { api } from './api'
import type { LicenseStatus } from './types'

export function useLicenseStatus(): UseQueryResult<LicenseStatus, Error> {
  return useQuery({
    queryKey: ['license', 'status'],
    queryFn: api.status,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false
  })
}
