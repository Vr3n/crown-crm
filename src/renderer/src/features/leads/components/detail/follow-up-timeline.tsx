import { CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timeline } from '@/components/timeline'
import { formatDateTime } from '../../format'
import type { FollowUp } from '../../types'
import { mapFollowUpsToEntries } from './follow-up-timeline-utils'

/**
 * Follow-ups as a timeline — every scheduled, completed, and cancelled
 * follow-up rendered chronologically using the universal Timeline component.
 */
export function FollowUpTimeline({ followUps }: { followUps: FollowUp[] }): React.JSX.Element {
  const entries = mapFollowUpsToEntries(followUps)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" />
          Follow-ups
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {entries.length} event{entries.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No follow-ups scheduled yet.</p>
        ) : (
          <Timeline entries={entries} formatDate={formatDateTime} />
        )}
      </CardContent>
    </Card>
  )
}
