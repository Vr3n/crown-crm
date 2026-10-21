import { CalendarClock, CreditCard, IndianRupee, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { effectiveStatus } from '../../build'
import { formatShortDate } from '../../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Customer } from '../../types'

/**
 * Compact bento tile summarising the financial pulse of a customer: outstanding
 * balance, next renewal window, membership count, and total paid to date.
 * Designed to sit beside CurrentMembershipCard in the second row of the bento
 * grid — same height, complementary density.
 */
export function QuickStatsCard({
  customer,
  now,
  className
}: {
  customer: Customer
  now: number
  className?: string
}): React.JSX.Element {
  const invoices = customer.invoices ?? []
  const currency = useCurrency()

  const outstanding = invoices
    .filter((inv) => inv.status !== 'VOID' && inv.status !== 'DRAFT')
    .reduce((s, inv) => s + inv.outstandingMinor, 0)

  const totalPaid = invoices.reduce((s, inv) => s + inv.paidMinor, 0)

  const activeMemberships = customer.memberships.filter((m) => effectiveStatus(m, now) === 'ACTIVE')

  const nextRenewal = activeMemberships.map((m) => m.endDate).sort((a, b) => a.localeCompare(b))[0]

  const daysUntilRenewal = nextRenewal
    ? Math.max(0, Math.ceil((new Date(nextRenewal).getTime() - now) / 86_400_000))
    : null

  return (
    <section
      className={cn(
        'crm-gradient-border flex flex-col rounded-xl border bg-card p-5 shadow-sm',
        className
      )}
      style={
        {
          '--gradient-start': 'var(--primary)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Quick stats
      </h3>

      <div className="mt-4 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              outstanding > 0
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
            )}
          >
            <IndianRupee className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Outstanding</p>
            <p
              className={cn(
                'font-mono text-lg font-bold tabular-nums tracking-tight',
                outstanding > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              )}
            >
              {formatMinor(outstanding, currency)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Next renewal</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {daysUntilRenewal !== null ? (
                <>
                  {formatShortDate(nextRenewal!)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({daysUntilRenewal}d)
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <CreditCard className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Memberships</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {customer.memberships.length} total
              {activeMemberships.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {' '}
                  · {activeMemberships.length} active
                </span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
            <Receipt className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">Total paid</p>
            <p className="font-mono text-sm font-semibold tabular-nums">
              {formatMinor(totalPaid, currency)}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
