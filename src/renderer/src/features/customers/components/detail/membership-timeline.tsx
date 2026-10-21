import { History, Sparkles, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline, type TimelineEntry } from '@/components/timeline'
import { formatDate } from '@/lib/format'
import { formatMinor, type CurrencyCode } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Membership } from '../../types'
import { effectiveStatus } from '../../build'
import { membershipBillingTotals } from '../../membership-billing'

/**
 * Maps Membership[] into generic TimelineEntry[] for the universal
 * Timeline component. Each membership period becomes a timeline entry, labelled
 * "Bought" for the first and "Renewed" for later periods, with a status badge
 * (incl. CANCELLED/TERMINATED) and the billed total / paid in the meta line.
 */
function mapMembershipsToEntries(
  memberships: Membership[],
  now: number,
  currency: CurrencyCode
): TimelineEntry[] {
  return [...memberships]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((m, index) => {
      const status = effectiveStatus(m, now)
      const billing = membershipBillingTotals(m)
      const isBought = index === 0
      const billingText =
        (m.invoices ?? []).length > 0
          ? `${formatMinor(billing.totalMinor, currency)} total · ${formatMinor(
              billing.paidMinor,
              currency
            )} paid`
          : undefined
      return {
        id: m.id,
        label: isBought ? 'Bought' : 'Renewed',
        date: m.startDate,
        description: `${m.plan} · ${formatDate(m.startDate)} → ${formatDate(m.endDate)}${
          m.joiningDate ? ` · joined ${formatDate(m.joiningDate)}` : ''
        }`,
        icon: isBought ? Sparkles : RotateCcw,
        iconTone:
          status === 'ACTIVE'
            ? 'bg-success/15 text-success'
            : status === 'FROZEN'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
        badge: {
          label: status,
          variant:
            status === 'ACTIVE'
              ? ('success' as const)
              : status === 'CANCELLED' || status === 'TERMINATED'
                ? ('destructive' as const)
                : ('secondary' as const)
        },
        meta:
          billingText ??
          (m.freezes.length > 0
            ? `${m.freezes.length} freeze${m.freezes.length === 1 ? '' : 's'}`
            : undefined)
      }
    })
}

/**
 * Membership history as a timeline — every entitlement period rendered
 * chronologically using the universal Timeline component: the first purchase
 * shows "Bought", subsequent periods "Renewed", with a status badge for
 * cancelled/terminated and the billed total / paid per period.
 */
export function MembershipTimeline({
  memberships,
  now
}: {
  memberships: Membership[]
  now: number
}): React.JSX.Element {
  const currency = useCurrency()
  const entries = mapMembershipsToEntries(memberships, now, currency)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Membership history
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} period{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No membership purchased yet — this customer is on record without a plan.
          </p>
        ) : (
          <Timeline entries={entries} formatDate={formatDate} />
        )}
      </CardContent>
    </Card>
  )
}
