import { Crown, ShieldX } from 'lucide-react'
import type { LicenseStatus } from '../types'

interface LicenseBlockedProps {
  status: LicenseStatus
}

const REASON_MESSAGES: Record<string, string> = {
  NO_LOCK:
    'No install lock was found for this copy of Crown Books. Reinstall Crown Books on this computer.',
  FINGERPRINT_MISMATCH:
    'This copy of Crown Books is bound to a different computer. Reinstall Crown Books on this computer to use it.',
  CORRUPT: 'The install lock could not be read. Reinstall Crown Books on this computer.'
}

export function LicenseBlocked({ status }: LicenseBlockedProps): React.JSX.Element {
  const message = REASON_MESSAGES[status.reason ?? ''] ?? REASON_MESSAGES.NO_LOCK

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex size-12 items-center justify-center rounded-lg bg-destructive/10">
        <ShieldX className="size-6 text-destructive" />
      </div>

      <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Crown Books is not licensed for this computer
        </h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Crown className="size-4" />
        <span>Crown Books</span>
      </div>
    </div>
  )
}
