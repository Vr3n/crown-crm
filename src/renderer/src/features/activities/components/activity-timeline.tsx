import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { groupByDay } from '../build'
import type { ActivityRow } from '../types'
import { ActivityEntry } from './activity-entry'

/**
 * The global activity audit — a day-grouped timeline reusing the lead-detail
 * timeline language (tinted icon chips, continuous hairline rail), each entry
 * linking back to its lead. Today and Yesterday get human labels.
 */
export function ActivityTimeline({ rows }: { rows: ActivityRow[] }): React.JSX.Element {
  const groups = groupByDay(rows)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-primary" />
          Activities
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
            {rows.length} event{rows.length === 1 ? '' : 's'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activities match these filters.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {group.items.length}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <ol className="relative">
                  {group.items.map((item, i) => (
                    <ActivityEntry
                      key={item.id}
                      activity={item}
                      connector={i < group.items.length - 1}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
