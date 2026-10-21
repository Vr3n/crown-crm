import { CircleDashed, CreditCard, Receipt, Snowflake, Ban, RefreshCw, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { effectiveStatus, isPendingCancellation } from '../../build'
import { formatShortDate } from '../../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Membership } from '../../types'
import { MembershipStatusBadge } from '../status-badge'
import { GradientBorder } from './gradient-border'
import { Button } from '@/components/ui/button'

/**
 * The current entitlement card. Effective state comes from effectiveStatus()
 * (dates + open freezes, docs/02 §7), the price is the membership snapshot, and
 * the progress bar shows how far through the entitlement we are.
 *
 * When an active membership exists, the card is wrapped in an animated gradient
 * border (cyan → sky) matching the membership sale form's selected-card style.
 */
export function CurrentMembershipCard({
  currentMembership,
  now,
  onCancel,
  onRenew,
  onRevert
}: {
  currentMembership: Membership | undefined
  now: number
  onCancel?: (membershipId: string) => void
  onRenew?: (membershipId: string) => void
  onRevert?: (membershipId: string) => void
}): React.JSX.Element {
  const currency = useCurrency()

  if (!currentMembership) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CircleDashed className="size-4" />
          <h3 className="text-sm font-medium">Current membership</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          No active membership. This customer&apos;s history is kept on record below.
        </p>
      </section>
    )
  }

  const m = currentMembership
  const eff = effectiveStatus(m, now)
  const pending = isPendingCancellation(m, now)
  const startMs = new Date(m.startDate).getTime()
  const endMs = new Date(m.endDate).getTime()
  const elapsed = Math.max(0, Math.min(1, (now - startMs) / (endMs - startMs)))
  const openFreezes = m.freezes.filter(
    (f) => new Date(f.startDate).getTime() <= now && new Date(f.endDate).getTime() > now
  )
  const paid = m.priceMinor - m.discountMinor

  return (
    <GradientBorder>
      <section className="rounded-[calc(0.75rem-1.5px)] bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Current membership</h3>
          <MembershipStatusBadge status={eff} />
        </div>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-heading text-xl font-semibold tracking-tight">{m.plan}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {m.billingFrequency.charAt(0) + m.billingFrequency.slice(1).toLowerCase()} billing
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatMinor(paid, currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {m.discountMinor > 0 ? `${formatMinor(m.discountMinor, currency)} discount · ` : ''}
              {m.registrationFeeMinor > 0
                ? `+ ${formatMinor(m.registrationFeeMinor, currency)} registration`
                : 'no registration fee'}
            </p>
          </div>
        </div>

        {/* Pending cancellation banner */}
        {pending && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <Ban className="size-4" />
              <span>
                Cancellation effective{' '}
                <strong>{formatShortDate(m.cancellationEffectiveDate!)}</strong>
              </span>
            </div>
            {onRevert && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => onRevert(m.id)}
              >
                <Undo2 className="mr-1 size-3" />
                Undo
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {formatShortDate(m.startDate)} → {formatShortDate(m.endDate)}
          </span>
          <span className="font-mono text-xs font-medium tabular-nums">
            {Math.max(0, Math.ceil((endMs - now) / 86_400_000))}d left
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${elapsed * 100}%` }} />
        </div>

        {openFreezes.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Snowflake className="size-3.5 text-primary" />
            {openFreezes.map((f) => (
              <span
                key={f.id}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'
                )}
              >
                Frozen {formatShortDate(f.startDate)} → {formatShortDate(f.endDate)} · {f.reason}
              </span>
            ))}
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
          {onRenew && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onRenew(m.id)}
            >
              <RefreshCw className="mr-1 size-3" />
              Renew
            </Button>
          )}
          {onCancel && !pending && (eff === 'ACTIVE' || eff === 'FROZEN') && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onCancel(m.id)}
            >
              <Ban className="mr-1 size-3" />
              Cancel
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CreditCard className="size-3.5" /> #{m.id}
          </span>
          <span className="flex items-center gap-1.5">
            <Receipt className="size-3.5" /> sold {formatShortDate(m.createdAt)}
          </span>
        </div>
      </section>
    </GradientBorder>
  )
}
