import { startOfDay, endOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarClock } from 'lucide-react'
import type { TimelineEntry } from '@/components/timeline'
import { dueLabel } from '@/lib/format'
import type { FollowUpRow } from '@/features/followups/types'

export interface FollowUpTimelineFilters {
  leadId: number | 'ALL'
  range?: DateRange
}

/**
 * Pure filter/sort for the dashboard follow-ups timeline card.
 * Keeps only open follow-ups (not completed/cancelled), applies lead and
 * date-range (on `dueAt`) filters, sorts ascending by due date.
 */
export function filterOpenFollowUps(
  rows: FollowUpRow[],
  filters: FollowUpTimelineFilters
): FollowUpRow[] {
  return rows
    .filter((r) => !r.completedAt && !r.cancelledAt)
    .filter((r) => filters.leadId === 'ALL' || r.leadId === filters.leadId)
    .filter((r) => {
      const range = filters.range
      if (!range?.from && !range?.to) return true
      const due = new Date(r.dueAt).getTime()
      const from = range.from ? startOfDay(range.from).getTime() : Number.NEGATIVE_INFINITY
      const to = range.to ? endOfDay(range.to).getTime() : Number.POSITIVE_INFINITY
      return due >= from && due <= to
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

/**
 * Map open follow-up rows into generic TimelineEntry[] for the universal
 * Timeline component. Overdue entries get destructive tone, upcoming entries
 * get primary tone. Each entry shows the lead name for context when viewing
 * all leads.
 */
export function mapOpenFollowUpsToEntries(rows: FollowUpRow[]): TimelineEntry[] {
  return rows.map((row) => {
    const d = dueLabel(row.dueAt)
    return {
      id: row.id,
      label: row.title,
      date: row.dueAt,
      icon: CalendarClock,
      iconTone: d.overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
      badge: {
        label: d.overdue ? 'Overdue' : 'Upcoming',
        variant: d.overdue ? ('destructive' as const) : ('default' as const)
      },
      description: row.leadName,
      meta: `Due ${d.text}`
    }
  })
}
