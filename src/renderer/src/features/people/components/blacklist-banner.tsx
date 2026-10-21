import { useState } from 'react'
import { Ban, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BlacklistDialog } from './blacklist-dialog'

/**
 * Person blacklist surface for the detail pages (issue #104). Shows a red banner
 * when the person is blacklisted (reason visible to front desk) and, when the
 * caller has `person.blacklist` permission, a toggle that opens the shared
 * BlacklistDialog. When not blacklisted and no permission, nothing renders.
 */
export function BlacklistBanner({
  personId,
  personName,
  isBlacklisted,
  reason,
  canManage
}: {
  personId: number
  personName: string
  isBlacklisted: boolean
  reason?: string
  canManage: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)

  if (!isBlacklisted && !canManage) return null

  return (
    <>
      <section
        className={cn(
          'flex items-start gap-3 rounded-xl border p-4',
          isBlacklisted ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-muted/30'
        )}
      >
        <div className={cn('mt-0.5', isBlacklisted ? 'text-destructive' : 'text-muted-foreground')}>
          {isBlacklisted ? <Ban className="size-5" /> : <ShieldCheck className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-sm font-medium',
              isBlacklisted ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {isBlacklisted ? 'Blacklisted' : 'Person status'}
          </p>
          {isBlacklisted ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {reason?.trim() ? (
                <>
                  <span className="font-medium text-foreground">Reason:</span> {reason}
                </>
              ) : (
                'No reason recorded for this blacklist.'
              )}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Not blacklisted. This person can buy and renew memberships.
            </p>
          )}
        </div>
        {canManage ? (
          <Button
            variant={isBlacklisted ? 'outline' : 'destructive'}
            size="sm"
            className="shrink-0"
            onClick={() => setOpen(true)}
          >
            {isBlacklisted ? 'Lift blacklist' : 'Blacklist person'}
          </Button>
        ) : null}
      </section>

      <BlacklistDialog
        open={open}
        onOpenChange={setOpen}
        personId={personId}
        personName={personName}
        isBlacklisted={isBlacklisted}
      />
    </>
  )
}
