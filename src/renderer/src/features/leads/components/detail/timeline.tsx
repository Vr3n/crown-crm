import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline as TimelineBase, type TimelineEntry } from '@/components/timeline'
import { ACTIVITY_ICONS, ACTIVITY_TONE } from '../../activity-visuals'
import { ACTIVITY_LABELS } from '../../constants'
import { formatDateTime, timeAgo } from '../../format'
import type { Lead } from '../../types'

/**
 * Maps a LeadActivity array into generic TimelineEntry[] for the universal
 * Timeline component. Each activity gets its icon, tone, label, and metadata.
 */
function mapActivitiesToEntries(activities: Lead['activities']): TimelineEntry[] {
  return [...activities]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((act) => ({
      id: act.id,
      label: ACTIVITY_LABELS[act.type] ?? act.type,
      date: act.at,
      description: act.note,
      icon: ACTIVITY_ICONS[act.type],
      iconTone: ACTIVITY_TONE[act.type],
      meta: act.by ? `by ${act.by} · ${timeAgo(act.at)}` : timeAgo(act.at)
    }))
}

/**
 * The lead's discussion history as a timeline (Module 01 §24) — every call,
 * visit, tour, follow-up and stage change, newest first, joined by a continuous
 * hairline rail. This is the single place a staff member reads "what has
 * happened" without digging.
 */
export function Timeline({ lead }: { lead: Lead }): React.JSX.Element {
  const entries = mapActivitiesToEntries(lead.activities)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Timeline
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} event{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <TimelineBase entries={entries} formatDate={formatDateTime} />
        )}
      </CardContent>
    </Card>
  )
}
