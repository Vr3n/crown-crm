import { History, Snowflake } from 'lucide-react'
import { effectiveStatus } from '../../build'
import { formatShortDate } from '../../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { Customer, Membership } from '../../types'
import { MembershipStatusBadge } from '../status-badge'

function FreezeRows({ m }: { m: Membership }): React.JSX.Element | null {
  const currency = useCurrency()
  if (m.freezes.length === 0) return null
  return (
    <div className="mt-2 flex flex-col gap-1">
      {m.freezes.map((f) => (
        <div
          key={f.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground"
        >
          <Snowflake className="size-3 text-primary" />
          <span className="font-medium text-primary">
            {formatShortDate(f.startDate)} → {formatShortDate(f.endDate)}
          </span>
          <span>{f.reason}</span>
          <span className="text-muted-foreground/70">
            · {f.extensionDays}d extension · fee {formatMinor(f.feeMinor, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Full membership history — every entitlement period, never overwritten
 * (docs/02 §32). The header explicitly frames the list for retention questions
 * ("has this member been loyal?"), not just the current row.
 */
export function MembershipHistory({
  customer,
  now
}: {
  customer: Customer
  now: number
}): React.JSX.Element {
  const sorted = [...customer.memberships].sort((a, b) => b.startDate.localeCompare(a.startDate))
  const currency = useCurrency()

  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Membership history</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
          {sorted.length} period{sorted.length === 1 ? '' : 's'}
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No membership purchased yet — this customer is on record without a plan.
        </p>
      ) : (
        <div className="mt-3 flex flex-col divide-y">
          {sorted.map((m) => {
            const eff = effectiveStatus(m, now)
            return (
              <div key={m.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{m.plan}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatShortDate(m.startDate)} → {formatShortDate(m.endDate)}
                      <span className="ml-2 normal-case">
                        {m.billingFrequency.toLowerCase()} billing
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {formatMinor(m.priceMinor - m.discountMinor, currency)}
                    </span>
                    <MembershipStatusBadge status={eff} />
                  </div>
                </div>
                <FreezeRows m={m} />
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
