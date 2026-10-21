import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACTIVITY_ICONS, ACTIVITY_TONE } from '@/features/leads/activity-visuals'
import { ACTIVITY_LABELS } from '@/features/leads/constants'
import { formatDateTime, timeAgo } from '@/features/leads/format'
import type { ActivityRow } from '../types'

/**
 * One activity in the global audit timeline — the same icon chips and hairline
 * rail as the lead-detail timeline, plus the lead name as the navigation hook.
 */
export function ActivityEntry({
  activity,
  connector
}: {
  activity: ActivityRow
  /** Whether the continuous rail should continue below this node. */
  connector: boolean
}): React.JSX.Element {
  const Icon = ACTIVITY_ICONS[activity.type] ?? FileText
  return (
    <li className={cn('relative flex gap-3', connector ? 'pb-5' : 'pb-0')}>
      {connector && (
        <span aria-hidden className="absolute top-8 bottom-0 left-[13px] w-px bg-border" />
      )}
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          ACTIVITY_TONE[activity.type]
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">{ACTIVITY_LABELS[activity.type]}</p>
          <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatDateTime(activity.at)}
          </p>
        </div>
        <Link
          to={`/leads/${activity.leadId}`}
          state={{ from: '/activities' }}
          className="mt-0.5 inline-block text-sm font-medium text-primary hover:underline"
        >
          {activity.leadName}
        </Link>
        {activity.note ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{activity.note}</p>
        ) : null}
        {activity.by ? (
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            by {activity.by} · {timeAgo(activity.at)}
          </p>
        ) : null}
      </div>
    </li>
  )
}
