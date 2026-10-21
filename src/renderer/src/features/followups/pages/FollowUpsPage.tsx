import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { FollowUpDialog } from '@/features/leads/components/follow-up-dialog'
import { bucketOf, sortFollowUpRows } from '../build'
import { FollowUpFilters } from '../components/follow-up-filters'
import { FollowUpMetrics } from '../components/follow-up-metrics'
import { FollowUpTable } from '../components/follow-up-table'
import { filterFollowUps } from '../filters'
import { useFollowUpRows } from '../queries'
import type { FollowUpBucket, FollowUpFilters as FollowUpFilterState } from '../types'

const DEFAULT_FILTERS: FollowUpFilterState = { bucket: 'all', search: '' }

/**
 * Follow-ups (Module 01 §25) — the front-desk workbench. A flat queue of every
 * scheduled action across leads, defaulting to the all bucket, with an
 * inline "mark done" verb and row-click through to the lead. Completion logs a
 * Follow-up done activity and the sidebar badge tracks the real overdue count.
 */
export function FollowUpsPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { rows, isLoading } = useFollowUpRows()
  const [filters, setFilters] = useState<FollowUpFilterState>(DEFAULT_FILTERS)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const counts = useMemo<Record<FollowUpBucket, number>>(
    () => ({
      all: rows.length,
      overdue: rows.filter((r) => bucketOf(r) === 'overdue').length,
      today: rows.filter((r) => bucketOf(r) === 'today').length,
      upcoming: rows.filter((r) => bucketOf(r) === 'upcoming').length,
      done: rows.filter((r) => bucketOf(r) === 'done').length
    }),
    [rows]
  )

  const visible = useMemo(() => sortFollowUpRows(filterFollowUps(rows, filters)), [rows, filters])

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Follow-ups"
        description="Today's and overdue follow-ups, and the ones you've handled."
        actions={
          <Button onClick={() => setScheduleOpen(true)}>
            <BellPlus />
            Schedule follow-up
          </Button>
        }
      />

      <FollowUpMetrics rows={rows} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <FollowUpFilters counts={counts} filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <FollowUpTable
            rows={visible}
            bucket={filters.bucket}
            isLoading={isLoading}
            onOpenLead={(leadId) => navigate(`/leads/${leadId}`, { state: { from: '/followups' } })}
          />
        </CardContent>
      </Card>

      {scheduleOpen && <FollowUpDialog open={scheduleOpen} onOpenChange={setScheduleOpen} />}
    </div>
  )
}
