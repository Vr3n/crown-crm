import { BadgeCheck, CalendarClock, CalendarOff, Snowflake, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EXPIRING_SOON_DAYS } from '@/features/customers/constants'
import { daysUntil } from '@/features/customers/format'
import type { MembershipRow } from '../types'

interface Metric {
  key: 'active' | 'soon' | 'frozen' | 'ended'
  label: string
  icon: LucideIcon
  chip: string
  gradient: { start: string; end: string } | null
  count: (rows: MembershipRow[], now: number) => number
}

const METRICS: Metric[] = [
  {
    key: 'active',
    label: 'Active',
    icon: BadgeCheck,
    chip: 'bg-success/15 text-success',
    gradient: { start: 'var(--success)', end: 'var(--primary)' },
    count: (rows) => rows.filter((r) => r.status === 'ACTIVE').length
  },
  {
    key: 'soon',
    label: 'Expiring soon',
    icon: CalendarClock,
    chip: 'bg-warning/15 text-warning',
    gradient: { start: 'var(--warning)', end: 'var(--primary)' },
    count: (rows, now) =>
      rows.filter((r) => r.status === 'ACTIVE' && daysUntil(r.endDate, now) <= EXPIRING_SOON_DAYS)
        .length
  },
  {
    key: 'frozen',
    label: 'Frozen',
    icon: Snowflake,
    chip: 'bg-primary/10 text-primary',
    gradient: { start: 'var(--primary)', end: 'var(--primary)' },
    count: (rows) => rows.filter((r) => r.status === 'FROZEN').length
  },
  {
    key: 'ended',
    label: 'Ended',
    icon: CalendarOff,
    chip: 'bg-muted text-muted-foreground',
    gradient: null,
    count: (rows) =>
      rows.filter(
        (r) => r.status === 'EXPIRED' || r.status === 'CANCELLED' || r.status === 'TERMINATED'
      ).length
  }
]

/**
 * Membership entitlement headline: active / expiring soon / frozen / ended.
 * Counts respect the active filters above.
 */
export function MembershipMetrics({
  rows,
  now
}: {
  rows: MembershipRow[]
  now: number
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {METRICS.map((m) => (
        <div
          key={m.key}
          className={cn(
            'crm-gradient-border flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3'
          )}
          style={
            m.gradient
              ? ({
                  '--gradient-start': m.gradient.start,
                  '--gradient-end': m.gradient.end
                } as React.CSSProperties)
              : undefined
          }
        >
          <div
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', m.chip)}
          >
            <m.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xl leading-none font-semibold tabular-nums">
              {m.count(rows, now)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
