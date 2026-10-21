import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SearchInput } from '@/features/dashboard/components/search-input'
import type { FollowUpBucket, FollowUpFilters } from '../types'

const BUCKETS: { key: FollowUpBucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done', label: 'Done' }
]

/**
 * Queue controls: urgency-bucket tabs (with live counts) on the left, the
 * free-text search beside them in the same row — mirroring the leads page.
 */
export function FollowUpFilters({
  counts,
  filters,
  onChange
}: {
  counts: Record<FollowUpBucket, number>
  filters: FollowUpFilters
  onChange: (f: FollowUpFilters) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={filters.bucket}
        onValueChange={(v) => onChange({ ...filters, bucket: v as FollowUpBucket })}
      >
        <TabsList>
          {BUCKETS.map((b) => (
            <TabsTrigger key={b.key} value={b.key}>
              {b.label}
              <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                {counts[b.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="ml-auto min-w-0 flex-1 sm:max-w-64">
        <SearchInput
          value={filters.search}
          onChange={(search) => onChange({ ...filters, search })}
          placeholder="Search lead or action…"
        />
      </div>
    </div>
  )
}
