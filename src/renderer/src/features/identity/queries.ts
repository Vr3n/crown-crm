import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import type { OrganizationProfile, Role, StaffMember } from './types'
import type { OrgLogo } from './logo'
import type {
  OrgLogoOutput,
  UpdateOrgLogoInput
} from '../../../../shared/contracts/organization-logo'

const identityKeys = {
  all: ['identity-settings'] as const,
  organization: () => [...identityKeys.all, 'organization'] as const,
  orgLogo: () => [...identityKeys.all, 'organization', 'logo'] as const,
  staff: () => [...identityKeys.all, 'staff'] as const,
  roles: () => [...identityKeys.all, 'roles'] as const
}

export function useOrganization(): UseQueryResult<OrganizationProfile, Error> {
  return useQuery({
    queryKey: identityKeys.organization(),
    queryFn: () => api.organization()
  })
}

/** Organization logo with base64 data for <img> display. Cached 5 min (static asset). */
export function useOrgLogo(): UseQueryResult<OrgLogo, Error> {
  return useQuery({
    queryKey: identityKeys.orgLogo(),
    queryFn: async () => {
      const out = await api.orgLogo()
      if (!out.logoData || !out.mimeType) return { filename: out.logoFilename, src: null }
      return {
        filename: out.logoFilename,
        src: `data:${out.mimeType};base64,${out.logoData}`
      }
    },
    staleTime: 5 * 60 * 1000
  })
}

export function useUpdateOrgLogo(): UseMutationResult<OrgLogoOutput, Error, UpdateOrgLogoInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateOrgLogoInput) => api.updateOrgLogo(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: identityKeys.all })
      toast.success('Logo updated')
    },
    onError: (e: Error) => toast.error('Logo upload failed', { description: e.message })
  })
}

export function useDeleteOrgLogo(): UseMutationResult<void, Error, void> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.deleteOrgLogo(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: identityKeys.all })
      toast.success('Logo removed')
    },
    onError: (e: Error) => toast.error('Logo removal failed', { description: e.message })
  })
}

export function useStaff(): UseQueryResult<StaffMember[], Error> {
  return useQuery({ queryKey: identityKeys.staff(), queryFn: () => api.staff() })
}

export function useRoles(): UseQueryResult<Role[], Error> {
  return useQuery({ queryKey: identityKeys.roles(), queryFn: () => api.roles() })
}

/**
 * Generic identity mutation: invalidate every identity-settings query on success
 * so the admin read models (metrics, tables, drawers) re-derive from the store.
 */
function useIdentityMutation<TInput, TResult>(
  mutator: (input: TInput) => Promise<TResult>,
  successMessage: string
): UseMutationResult<TResult, Error, TInput> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mutator,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: identityKeys.all })
      toast.success(successMessage)
      void result
    },
    onError: (e) => toast.error('Something went wrong', { description: e.message })
  })
}

export function useCreateStaff(): UseMutationResult<StaffMember, Error, Record<string, unknown>> {
  return useIdentityMutation((input) => api.createStaff(input as never), 'Staff member added')
}

export function useUpdateStaff(): UseMutationResult<StaffMember, Error, Record<string, unknown>> {
  return useIdentityMutation((input) => api.updateStaff(input as never), 'Staff member updated')
}

export function useUpdateRole(): UseMutationResult<Role, Error, Record<string, unknown>> {
  return useIdentityMutation((input) => api.updateRole(input as never), 'Role updated')
}

export function useUpdateOrganization(): UseMutationResult<
  OrganizationProfile,
  Error,
  Record<string, unknown>
> {
  return useIdentityMutation(
    (input) => api.updateOrganization(input as never),
    'Organization updated'
  )
}
