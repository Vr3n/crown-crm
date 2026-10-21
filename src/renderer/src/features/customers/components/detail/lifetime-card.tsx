import { CircleDashed, UserCheck, UserCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrency } from '@/hooks/use-currency'
import { formatMinor } from '@/lib/money'
import { formatMonthYear, monthsSince } from '../../format'
import type { Customer } from '../../types'

/**
 * Tenure & value snapshot for the 360 view. Every number here is derived from
 * the membership history (docs/09 read-model rule) — lifetime value is the sum
 * of paid entitlement snapshots, never a stored counter.
 *
 * Styled as a bento accent tile: top accent border, compact 2-col metric grid,
 * designed to sit in a 5-col span beside the wider identity anchor.
 */
export function LifetimeCard({
  customer,
  now,
  className
}: {
  customer: Customer
  now: number
  className?: string
}): React.JSX.Element {
  const currency = useCurrency()
  const lifetimeValue = customer.memberships.reduce(
    (sum, m) => sum + (m.priceMinor - m.discountMinor + m.registrationFeeMinor),
    0
  )
  const freezeDays = customer.memberships.reduce(
    (sum, m) =>
      sum +
      m.freezes.reduce(
        (s, f) =>
          s +
          Math.round(
            (new Date(f.endDate).getTime() - new Date(f.startDate).getTime()) / 86_400_000
          ),
        0
      ),
    0
  )

  return (
    <section
      className={cn(
        'crm-gradient-border flex flex-col rounded-xl border border-t-2 border-t-primary bg-card p-4 shadow-sm',
        className
      )}
      style={
        {
          '--gradient-start': 'var(--success)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Tenure & value
      </h3>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
        {formatMinor(lifetimeValue, currency)}
      </p>
      <p className="text-[11px] text-muted-foreground">
        lifetime value · since {formatMonthYear(customer.joinedAt)}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserCheck className="size-3 text-emerald-500 dark:text-emerald-400" /> Member for
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums">
            {monthsSince(customer.joinedAt, now)} months
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleDashed className="size-3 text-blue-500 dark:text-blue-400" /> Memberships
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums">
            {customer.memberships.length} total
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserCog className="size-3 text-violet-500 dark:text-violet-400" /> Owned by
          </span>
          <span className="truncate text-xs font-semibold">
            {customer.ownerName ?? 'Unassigned'}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CircleDashed className="size-3 text-amber-500 dark:text-amber-400" /> Freeze days
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums">{freezeDays} days</span>
        </div>
      </div>
    </section>
  )
}
