import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isApiError } from '../../../../shared/contracts/errors'

/**
 * Person blacklist toggle (issue #104). Blacklist is a *Person*-level attribute,
 * so a toggle invalidates both the leads and customers read models — the same
 * person may appear in either surface.
 */

export interface BlacklistToggleVariables {
  personId: number
  action: 'blacklist' | 'unblacklist'
  reason?: string | null
}

export interface BlacklistToggleResult {
  personId: number
  isBlacklisted: boolean
}

/** The renderer's persona name — shown alongside any error toast. */
function errorMessage(e: Error, fallback: string): string {
  return isApiError(e) ? e.message : fallback
}

export function useBlacklistToggle(): UseMutationResult<
  BlacklistToggleResult,
  Error,
  BlacklistToggleVariables
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (variables) =>
      window.api.blacklist.toggle({
        personId: variables.personId,
        action: variables.action,
        reason: variables.reason ?? null
      }),
    onSuccess: (_data, variables) => {
      const blacklisted = variables.action === 'blacklist'
      qc.invalidateQueries({ queryKey: ['leads'], refetchType: 'all' })
      qc.invalidateQueries({ queryKey: ['customers'], refetchType: 'all' })
      toast.success(blacklisted ? 'Person blacklisted' : 'Blacklist lifted')
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not update blacklist status'))
  })
}
