import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { CompanyProfile } from '../../../shared/contracts/identity'

export const companyKeys = {
  profile: ['company', 'profile'] as const
}

/** The active company profile. Cached for the session; mutations invalidate it. */
export function useCompanyProfile(): UseQueryResult<CompanyProfile | null> {
  return useQuery({
    queryKey: companyKeys.profile,
    queryFn: () => window.api.identity.company(),
    staleTime: 60_000
  })
}

export type { CompanyProfile }
