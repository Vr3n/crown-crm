import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from '@tanstack/react-query'

/**
 * Identity session state — the single source of truth for "who is signed in",
 * managed entirely by TanStack Query (no useEffect / ad-hoc useState syncing).
 *
 * The session/status live in the global query cache keyed by `identityKeys`.
 * Logging in or out updates those keys so every subscriber re-renders from the
 * same, non-stale source. See the identity status/session IPC in preload.
 */

export type IdentityStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'
export type SessionContext = Awaited<ReturnType<typeof window.api.identity.session>>

export const identityKeys = {
  status: ['identity', 'status'] as const,
  session: ['identity', 'session'] as const
}

/** Boot-time phase of the machine: needs setup, needs login, or already in. */
export function useIdentityStatus(): UseQueryResult<IdentityStatus> {
  return useQuery({
    queryKey: identityKeys.status,
    queryFn: () => window.api.identity.status(),
    retry: false
  })
}

/** The resolved session for the current user. Enabled only once authenticated. */
export function useIdentitySession(enabled: boolean): UseQueryResult<SessionContext | null> {
  return useQuery({
    queryKey: identityKeys.session,
    queryFn: () => window.api.identity.session(),
    enabled,
    retry: false
  })
}

/**
 * Signs out of the backend and immediately reflects it in the cache so the UI
 * flips to the login phase instead of serving the stale `AUTHENTICATED` status
 * that the query cache held from before logout.
 */
export function useLogout(): UseMutationResult<boolean, unknown, void, unknown> {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: () => window.api.identity.logout(),
    onSuccess: () => {
      qc.setQueryData<IdentityStatus>(identityKeys.status, 'LOGIN_REQUIRED')
      qc.setQueryData<SessionContext | null>(identityKeys.session, null)
      void qc.invalidateQueries({ queryKey: ['identity'] })
      toast.error('Signed out', {
        description: 'Your session has ended. See you soon!'
      })
    }
  })
}

/**
 * Commits a just-established session (setup/login) into the cache so the app
 * transitions to the authenticated view. No local state, no effects — the
 * query cache is the source of truth.
 */
export function useCommitSession(): (session: SessionContext) => void {
  const qc = useQueryClient()

  return useCallback(
    (session: SessionContext) => {
      qc.setQueryData<IdentityStatus>(identityKeys.status, 'AUTHENTICATED')
      qc.setQueryData(identityKeys.session, session)
    },
    [qc]
  )
}
