import { CalendarClock, CalendarOff, Flame, PauseCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Offer } from '../types'
import { offerLifecycle } from '../pricing'

interface Metric {
  key: 'live' | 'upcoming' | 'ended' | 'paused'
  label: string
  icon: LucideIcon
  chip: string
  count: (offers: Offer[]) => number
}

const METRICS: Metric[] = [
  {
    key: 'live',
    label: 'Live now',
    icon: Flame,
    chip: 'bg-success/15 text-success',
    count: (offers) => offers.filter((o) => offerLifecycle(o) === 'LIVE').length
  },
  {
    key: 'upcoming',
    label: 'Upcoming',
    icon: CalendarClock,
    chip: 'bg-primary/10 text-primary',
    count: (offers) => offers.filter((o) => offerLifecycle(o) === 'UPCOMING').length
  },
  {
    key: 'ended',
    label: 'Ended',
    icon: CalendarOff,
    chip: 'bg-muted text-muted-foreground',
    count: (offers) => offers.filter((o) => offerLifecycle(o) === 'ENDED').length
  },
  {
    key: 'paused',
    label: 'Paused',
    icon: PauseCircle,
    chip: 'bg-warning/15 text-warning',
    count: (offers) => offers.filter((o) => offerLifecycle(o) === 'PAUSED').length
  }
]

/**
 * Offer headline split by lifecycle so paused/ended offers never look "live".
 * Counts reflect the active filters above; nothing is fabricated.
 */
export function OfferMetrics({ offers }: { offers: Offer[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {METRICS.map((m) => (
        <div
          key={m.key}
          className="flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3"
        >
          <div
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', m.chip)}
          >
            <m.icon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xl leading-none font-semibold tabular-nums">
              {m.count(offers)}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
