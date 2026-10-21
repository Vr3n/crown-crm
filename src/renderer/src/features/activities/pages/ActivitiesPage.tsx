import { useMemo, useState } from 'react'
import { PhoneCall } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { LogActivityDialog } from '@/features/leads/components/log-activity-dialog'
import { ActivityFilters } from '../components/activity-filters'
import { ActivityTimeline } from '../components/activity-timeline'
import { filterActivities } from '../filters'
import { sortActivityRows } from '../build'
import { useActivityRows } from '../queries'
import type { ActivityFilters as ActivityFilterState } from '../types'

const DEFAULT_FILTERS: ActivityFilterState = {
  type: 'ALL',
  ownerId: 'ALL',
  range: 'all',
  search: ''
}

/**
 * Activities (Module 01 §24) — a chronological audit of every call, visit, tour
 * and discussion across all leads, grouped by day. Each entry links back to its
 * lead; new touchpoints are logged via the (lead-picking) Log activity dialog.
 */
export function ActivitiesPage(): React.JSX.Element {
  const { rows, isLoading } = useActivityRows()
  const [filters, setFilters] = useState<ActivityFilterState>(DEFAULT_FILTERS)
  const [logOpen, setLogOpen] = useState(false)

  const visible = useMemo(() => sortActivityRows(filterActivities(rows, filters)), [rows, filters])

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Activities"
        description="Chronological history of every call, visit, tour and discussion."
        actions={
          <Button onClick={() => setLogOpen(true)}>
            <PhoneCall />
            Log activity
          </Button>
        }
      />

      <ActivityFilters rows={rows} filters={filters} onChange={setFilters} />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <ActivityTimeline rows={visible} />
      )}

      {logOpen && <LogActivityDialog open={logOpen} onOpenChange={setLogOpen} />}
    </div>
  )
}
