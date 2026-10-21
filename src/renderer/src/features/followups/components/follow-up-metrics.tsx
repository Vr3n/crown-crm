import { AlarmClock, CalendarCheck2, CalendarClock, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FollowUpRow } from '../types'
import { bucketOf } from '../build'

interface Metric {
  key: 'overdue' | 'today' | 'week' | 'done'
  label: string
  icon: LucideIcon
  chip: string
  gradient: { start: string; end: string } | null
  count: (rows: FollowUpRow[]) => number
}

const WEEK_MS = 7 * 24 * 3600 * 1000

const METRICS: Metric[] = [
  {
    key: 'overdue',
    label: 'Overdue',
    icon: AlarmClock,
    chip: 'bg-destructive/10 text-destructive',
    gradient: { start: 'var(--destructive)', end: 'var(--warning)' },
    count: (rows) =>
      rows.filter((r) => !r.completedAt && new Date(r.dueAt).getTime() < Date.now()).length
  },
  {
    key: 'today',
    label: 'Due today',
    icon: CalendarClock,
    chip: 'bg-primary/10 text-primary',
    gradient: { start: 'var(--primary)', end: 'var(--primary)' },
    count: (rows) => rows.filter((r) => bucketOf(r) === 'today').length
  },
  {
    key: 'week',
    label: 'Due this week',
    icon: CalendarDays,
    chip: 'bg-muted text-muted-foreground',
    gradient: null,
    count: (rows) =>
      rows.filter((r) => !r.completedAt && new Date(r.dueAt).getTime() < Date.now() + WEEK_MS)
        .length
  },
  {
    key: 'done',
    label: 'Completed',
    icon: CalendarCheck2,
    chip: 'bg-success/15 text-success',
    gradient: { start: 'var(--success)', end: 'var(--primary)' },
    count: (rows) => rows.filter((r) => !!r.completedAt).length
  }
]

/**
 * Follow-up queue headline (Module 01 §25): overdue / today / this week /
 * completed. Mono tabular counts with tone-coded icon chips, matching the
 * pipeline metrics language.
 */
export function FollowUpMetrics({ rows }: { rows: FollowUpRow[] }): React.JSX.Element {
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
              {m.count(rows)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
