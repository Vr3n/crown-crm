import { Check, Circle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/format'

/**
 * A single entry in a timeline. The shape is domain-agnostic: callers map their
 * domain data (activities, follow-ups, price changes, memberships, invoices)
 * into this structure. The first entry is treated as "current" by default.
 */
export interface TimelineEntry {
  /** Unique identifier for React key and semantics. */
  id: string | number
  /** Primary text for this entry. */
  label: string
  /** ISO timestamp of when this event occurred. */
  date: string
  /** Longer explanation shown below the label. */
  description?: string
  /** Icon rendered inside the marker chip. */
  icon?: LucideIcon
  /** Tailwind classes for the icon chip (e.g. 'bg-primary/10 text-primary'). */
  iconTone?: string
  /** Optional badge rendered inline with the label. */
  badge?: {
    label: string
    variant?: 'default' | 'secondary' | 'destructive' | 'success' | 'warning'
  }
  /** Extra metadata line (e.g. 'by John · 2h ago', '₹49/mo'). */
  meta?: string
  /** Override: force this entry to render as "current" regardless of position. */
  isCurrent?: boolean
}

type TimelineProps = {
  entries: TimelineEntry[]
  /** Show the first entry as current (default: true). */
  highlightCurrent?: boolean
  /** Custom date formatter. Defaults to formatDate from @/lib/format. */
  formatDate?: (iso: string) => string
  className?: string
}

const defaultDateFormatter = formatDate

export function Timeline({
  entries,
  highlightCurrent = true,
  formatDate: fmt = defaultDateFormatter,
  className
}: TimelineProps): React.JSX.Element {
  if (entries.length === 0) return <></>

  return (
    <ol aria-label="Timeline" className={cn('relative flex flex-col', className)}>
      {entries.map((entry, index) => {
        const isCurrent = highlightCurrent && (entry.isCurrent ?? index === 0)
        const isLast = index === entries.length - 1
        const Icon = entry.icon ?? Circle

        return (
          <li
            key={entry.id}
            className={cn(
              'relative grid grid-cols-[1.5rem_1fr] gap-4 sm:grid-cols-[2rem_1fr] sm:gap-5',
              !isLast && 'pb-6'
            )}
          >
            {/* Connector rail */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute left-[0.7rem] top-6 h-[calc(100%-1.25rem)] w-px bg-border sm:left-[0.95rem]"
              />
            )}

            {/* Marker */}
            <span
              className={cn(
                'relative z-10 mt-1 flex size-5 items-center justify-center rounded-full border-2 border-background text-muted-foreground ring-1 ring-border sm:size-6',
                isCurrent
                  ? 'bg-primary text-primary-foreground ring-primary/20'
                  : entry.iconTone
                    ? entry.iconTone
                    : 'bg-muted'
              )}
            >
              {isCurrent && !entry.icon ? (
                <Check aria-hidden="true" className="size-3" />
              ) : (
                <Icon aria-hidden="true" className="size-3" />
              )}
            </span>

            {/* Content */}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium tracking-tight">{entry.label}</h3>
                    {entry.badge && (
                      <Badge
                        variant={entry.badge.variant ?? 'secondary'}
                        className="rounded-full px-2 py-0 text-[11px]"
                      >
                        {entry.badge.label}
                      </Badge>
                    )}
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {fmt(entry.date)}
                  </p>
                </div>
                {entry.meta && (
                  <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {entry.meta}
                  </p>
                )}
              </div>
              {entry.description && (
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {entry.description}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
