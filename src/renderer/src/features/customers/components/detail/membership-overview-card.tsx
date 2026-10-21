import { CreditCard, Receipt, Ban, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { effectiveStatus } from '../../build'
import { formatShortDate } from '../../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { Button } from '@/components/ui/button'
import { membershipBillingTotals } from '../../membership-billing'
import type { Membership } from '../../types'
import { MembershipStatusBadge } from '../status-badge'

/**
 * Overview of ONE purchased membership (Module 02 snapshot): plan, commercial
 * terms, entitlement window and freeze state — everything needed to answer
 * "what did this member buy?" without opening another screen. Values are the
 * sale-time snapshot in finished rupees; never recomputed from the plan.
 *
 * Shows the joining date, the billed Total (from the membership's invoice) and
 * Paid / Outstanding, plus optional Cancel and Renew actions (gated by the
 * caller via `canCancel` / `canRenew`).
 *
 * `variant="hero"` renders the anchor cell of the bento grid: larger type,
 * bigger price, more internal padding. The default variant is the compact
 * supporting cell.
 */
export function MembershipOverviewCard({
  membership,
  now,
  variant = 'default',
  canCancel = false,
  canRenew = false,
  onCancel,
  onRenew,
  className
}: {
  membership: Membership
  now: number
  variant?: 'default' | 'hero'
  canCancel?: boolean
  canRenew?: boolean
  onCancel?: () => void
  onRenew?: () => void
  className?: string
}): React.JSX.Element {
  const m = membership
  const currency = useCurrency()
  const eff = effectiveStatus(m, now)
  const startMs = new Date(m.startDate).getTime()
  const endMs = new Date(m.endDate).getTime()
  const elapsed = Math.max(0, Math.min(1, (now - startMs) / Math.max(1, endMs - startMs)))
  const daysLeft = Math.max(0, Math.ceil((endMs - now) / 86_400_000))
  const paid = m.priceMinor - m.discountMinor
  const openFreezes = m.freezes.filter(
    (f) => new Date(f.startDate).getTime() <= now && new Date(f.endDate).getTime() > now
  )
  const billing = membershipBillingTotals(m)
  const hasBilling = (m.invoices ?? []).length > 0

  const hero = variant === 'hero'
  const canAct = canCancel || canRenew

  return (
    <div
      className={cn(
        'crm-gradient-border flex flex-col rounded-xl border bg-card shadow-sm',
        hero ? 'p-6' : 'p-5',
        className
      )}
      style={
        {
          '--gradient-start': 'var(--success)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CreditCard className="size-3.5" /> Membership #{m.id}
        </span>
        <MembershipStatusBadge status={eff} />
      </div>

      <p
        className={cn(
          'mt-3 font-heading font-semibold tracking-tight',
          hero ? 'text-xl' : 'text-lg'
        )}
      >
        {m.plan}
      </p>
      <p className="text-xs text-muted-foreground">
        {m.billingFrequency.charAt(0) + m.billingFrequency.slice(1).toLowerCase()} billing
        {m.joiningDate ? (
          <>
            {' '}
            · joined {formatShortDate(m.joiningDate)}
          </>
        ) : null}
      </p>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t pt-3">
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          <span>
            Base{' '}
            <span className="font-mono tabular-nums text-foreground">
              {formatMinor(m.priceMinor, currency)}
            </span>
          </span>
          <span>
            Discount{' '}
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              −{formatMinor(m.discountMinor, currency)}
            </span>
          </span>
          {m.registrationFeeMinor > 0 ? (
            <span>
              Registration{' '}
              <span className="font-mono tabular-nums text-foreground">
                +{formatMinor(m.registrationFeeMinor, currency)}
              </span>
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <p className={cn('font-mono font-semibold tabular-nums', hero ? 'text-2xl' : 'text-xl')}>
            {formatMinor(paid, currency)}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Final price</p>
        </div>
      </div>

      {hasBilling ? (
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-2.5 text-center">
          <div>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {formatMinor(billing.totalMinor, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">Total</p>
          </div>
          <div>
            <p className="font-mono text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatMinor(billing.paidMinor, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">Paid</p>
          </div>
          <div>
            <p
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                billing.outstandingMinor > 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {formatMinor(billing.outstandingMinor, currency)}
            </p>
            <p className="text-[11px] text-muted-foreground">Outstanding</p>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed bg-muted/20 p-2.5 text-center text-xs text-muted-foreground">
          No linked invoice yet
        </div>
      )}

      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
          <span className="text-blue-600 dark:text-blue-400">{formatShortDate(m.startDate)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="text-purple-600 dark:text-purple-400">{formatShortDate(m.endDate)}</span>
        </span>
        <span className="font-mono text-xs font-medium tabular-nums">{daysLeft}d left</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${elapsed * 100}%` }} />
      </div>

      {openFreezes.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {openFreezes.map((f) => (
            <span
              key={f.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              Frozen {formatShortDate(f.startDate)} → {formatShortDate(f.endDate)}
              {f.reason ? ` · ${f.reason}` : ''}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
        <Receipt className="size-3.5" /> sold {formatShortDate(m.createdAt)}
      </div>

      {canAct ? (
        <div className="mt-3 flex gap-2">
          {canRenew ? (
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onRenew}>
              <RotateCcw className="size-3.5" />
              Renew
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:bg-destructive/10"
              onClick={onCancel}
            >
              <Ban className="size-3.5" />
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}