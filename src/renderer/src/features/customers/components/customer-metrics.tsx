import { CalendarClock, CircleDashed, Snowflake, UserCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EXPIRING_SOON_DAYS } from '../constants'
import { daysUntil } from '../format'
import type { CustomerRow } from '../types'

interface Metric {
  key: 'active' | 'soon' | 'frozen' | 'noPlan'
  label: string
  icon: LucideIcon
  chip: string
  gradient: { start: string; end: string } | null
  count: (rows: CustomerRow[], now: number) => number
}

const METRICS: Metric[] = [
  {
    key: 'active',
    label: 'Active members',
    icon: UserCheck,
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
      rows.filter(
        (r) =>
          r.status === 'ACTIVE' &&
          r.nextExpiry !== undefined &&
          daysUntil(r.nextExpiry, now) <= EXPIRING_SOON_DAYS
      ).length
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
    key: 'noPlan',
    label: 'No active plan',
    icon: CircleDashed,
    chip: 'bg-muted text-muted-foreground',
    gradient: null,
    count: (rows) =>
      rows.filter((r) => r.status === 'EXPIRED' || r.status === 'NONE' || r.status === 'PENDING')
        .length
  }
]

/**
 * Customer directory headline: active members / expiring soon / frozen / no
 * active plan. "No active plan" makes the Customer ≠ Active Member rule visible
 * (docs/02 §4). Counts respect the active filters above.
 */
export function CustomerMetrics({
  rows,
  now
}: {
  rows: CustomerRow[]
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
