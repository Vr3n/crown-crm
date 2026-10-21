import { useCallback, useMemo, useState } from 'react'
import { addDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { ListTodo, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'
import { Timeline } from '@/components/timeline'
import { FollowUpDialog } from '@/features/leads/components/follow-up-dialog'
import { useLeads } from '@/features/leads/queries'
import { useFollowUpRows } from '@/features/followups/queries'
import { formatDateTime } from '@/lib/format'
import { DateRangePicker, type DateRangePreset } from './date-range-picker'
import { filterOpenFollowUps, mapOpenFollowUpsToEntries } from '../follow-up-timeline'

/**
 * Follow-ups timeline card — half-width dashboard card that sits beside
 * Leads Going Cold. Shows open follow-ups as a timeline, filterable by
 * lead (dropdown) and date range (defaults to "from today").
 */
export function FollowUpsTimelineCard(): React.JSX.Element {
  const { data: leads, isLoading: leadsLoading } = useLeads()
  const { rows: allRows, isLoading: followUpsLoading } = useFollowUpRows()

  const [leadId, setLeadId] = useState<number | 'ALL'>('ALL')
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(),
    to: undefined
  })
  const [dialogOpen, setDialogOpen] = useState(false)

  const isLoading = leadsLoading || followUpsLoading

  const hasActive = leadId !== 'ALL' || !!range?.from || !!range?.to

  const leadOptions = useMemo(
    () =>
      (leads ?? [])
        .map((l) => ({ id: l.id, name: l.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [leads]
  )

  const selectedLead = useMemo(
    () => (leadId !== 'ALL' ? ((leads ?? []).find((l) => l.id === leadId) ?? null) : null),
    [leadId, leads]
  )

  const presets = useMemo<DateRangePreset[]>(() => {
    const now = new Date()
    return [
      { label: 'Today', from: now, to: now },
      { label: 'Next 7d', from: now, to: addDays(now, 7) },
      { label: 'Next 30d', from: now, to: addDays(now, 30) },
      { label: 'All' }
    ]
  }, [])

  const filtered = useMemo(
    () => filterOpenFollowUps(allRows, { leadId, range }),
    [allRows, leadId, range]
  )

  const entries = useMemo(() => mapOpenFollowUpsToEntries(filtered), [filtered])

  const handleNewFollowUp = useCallback(() => setDialogOpen(true), [])

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--violet)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet/10 text-violet">
            <ListTodo className="size-4" />
          </span>
          <div className="flex flex-1 items-center justify-between">
            <span className="font-heading text-base">Follow-ups timeline</span>
            <Button variant="outline" size="sm" onClick={handleNewFollowUp}>
              <Plus className="size-4" />
              New follow-up
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={String(leadId)}
            onValueChange={(v) => setLeadId(v === 'ALL' ? 'ALL' : Number(v))}
          >
            <SelectTrigger className="w-48" aria-label="Lead">
              <SelectValue placeholder="All leads" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All leads</SelectItem>
              {leadOptions.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            presets={presets}
            value={range}
            onValueChange={setRange}
            placeholder="Filter by due date"
          />

          {hasActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => {
                setLeadId('ALL')
                setRange({ from: new Date(), to: undefined })
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title="No open follow-ups"
            description="Scheduled follow-ups matching your filters will appear here."
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Timeline entries={entries} formatDate={formatDateTime} />
          </div>
        )}
      </CardContent>

      {dialogOpen && (
        <FollowUpDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          lead={selectedLead ?? undefined}
        />
      )}
    </Card>
  )
}
