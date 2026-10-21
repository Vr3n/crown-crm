import { useQuery } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import { api } from '../api'
import { LicenseBlocked } from './license-blocked'
import type { LicenseStatus } from '../types'

interface LicenseGateProps {
  /** If true, the install lock matched this machine — render children. */
  children: React.ReactNode
}

/**
 * Gates the entire app behind the machine install lock.
 * Renders:
 * - A loading spinner while verifying,
 * - A blocking screen if the machine does not match the lock (LOCKED),
 * - `children` if ACTIVE.
 *
 * There is no activation step — the lock is generated during install and
 * verified here; a mismatch (e.g. the app folder was copied to another PC)
 * simply refuses to run.
 */
export function LicenseGate({ children }: LicenseGateProps): React.JSX.Element {
  const statusQuery = useQuery({
    queryKey: ['license', 'status'],
    queryFn: api.status,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false
  })

  const status: LicenseStatus | undefined = statusQuery.data

  // Loading
  if (statusQuery.isPending) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
        <div className="flex size-12 animate-pulse items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Crown className="size-6" />
        </div>
        <p className="text-sm text-muted-foreground">Verifying this computer…</p>
      </div>
    )
  }

  // Active — pass through to the app
  if (status?.state === 'ACTIVE') {
    return <>{children}</>
  }

  // Locked — machine does not match the install lock
  return <LicenseBlocked status={status ?? { state: 'LOCKED', reason: 'NO_LOCK' }} />
}
