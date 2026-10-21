import { useMemo } from 'react'
import {
  Ban,
  CalendarClock,
  DoorOpen,
  Dumbbell,
  Handshake,
  Heart,
  PhoneCall,
  ShieldOff,
  ShieldOffIcon,
  Sparkles,
  Trophy,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { STAGES } from '../constants'
import type { Lead, StageKey } from '../types'

/** One icon per pipeline stage, so the strip reads as a funnel at a glance. */
const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  NEW: Sparkles,
  CONTACTED: PhoneCall,
  INTERESTED: Heart,
  VISIT_SCHEDULED: CalendarClock,
  VISITED: DoorOpen,
  TRIAL: Dumbbell,
  NEGOTIATION: Handshake,
  WON: Trophy,
  LOST: XCircle,
  DO_NOT_DISTURB: ShieldOff,
  NOT_INTERESTED: ShieldOffIcon
}

/** Stage tone → tinted icon chip, mirroring the stage badges. */
const TONE_CHIP: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  engaged: 'bg-cyan-500/10 text-cyan-600',
  hot: 'bg-yellow-500/10 text-yellow-600',
  success: 'bg-success/15 text-success',
  danger: 'bg-red-800/15 text-red-800'
}

const TONE_GRADIENT: Record<string, { start: string; end: string } | null> = {
  default: null,
  engaged: { start: 'cyan', end: 'cyan' },
  hot: { start: 'yellow', end: 'yellow' },
  success: { start: 'var(--success)', end: 'var(--primary)' },
  danger: { start: 'var(--destructive)', end: 'var(--destructive)' }
}

/**
 * Pipeline metrics, ordered by stage so the strip maps 1:1 to the funnel:
 * neutral early stages → cyan engaged → yellow hot → green won → dark red lost. Each card carries
 * its own icon + tone. Counts reflect the active filters above; nothing is
 * fabricated.
 */
export function LeadMetrics({ leads }: { leads: Lead[] }): React.JSX.Element {
  const totals = useMemo(() => {
    const map = new Map<StageKey, number>()
    STAGES.forEach((s) => map.set(s.key, 0))
    leads.forEach((l) => map.set(l.stage, (map.get(l.stage) ?? 0) + 1))
    return map
  }, [leads])

  const blacklistedCount = useMemo(
    () => leads.filter((l) => l.isBlacklisted).length,
    [leads]
  )

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {STAGES.map((stage) => {
        const Icon = STAGE_ICONS[stage.key]
        const count = totals.get(stage.key) ?? 0
        const gradient = TONE_GRADIENT[stage.tone]
        return (
          <div
            key={stage.key}
            className={cn(
              'crm-gradient-border flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3'
            )}
            style={
              gradient
                ? ({
                    '--gradient-start': gradient.start,
                    '--gradient-end': gradient.end
                  } as React.CSSProperties)
                : undefined
            }
          >
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md',
                TONE_CHIP[stage.tone]
              )}
            >
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xl leading-none font-semibold tabular-nums">{count}</p>
              <p className="truncate text-xs text-muted-foreground">{stage.label}</p>
            </div>
          </div>
        )
      })}

      <div className="crm-gradient-border flex min-w-36 flex-1 items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-red-800/15 text-red-800">
          <Ban className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-xl leading-none font-semibold tabular-nums">
            {blacklistedCount}
          </p>
          <p className="truncate text-xs text-muted-foreground">Blacklisted</p>
        </div>
      </div>
    </div>
  )
}
