import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react'
import type { TimelineEntry } from '@/components/timeline'
import { dueLabel } from '../../format'
import type { FollowUp } from '../../types'

/**
 * Maps a FollowUp array into generic TimelineEntry[] for the universal
 * Timeline component. Open follow-ups are shown first (overdue first),
 * then completed, then cancelled.
 */
export function mapFollowUpsToEntries(followUps: FollowUp[]): TimelineEntry[] {
  const open = followUps
    .filter((f) => !f.completedAt && !f.cancelledAt)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))

  const done = followUps
    .filter((f) => f.completedAt)
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))

  const cancelled = followUps
    .filter((f) => f.cancelledAt)
    .sort((a, b) => b.cancelledAt!.localeCompare(a.cancelledAt!))

  const entries: TimelineEntry[] = []

  for (const f of open) {
    const d = dueLabel(f.dueAt)
    entries.push({
      id: f.id,
      label: f.title,
      date: f.dueAt,
      description: d.overdue ? 'This follow-up is overdue.' : undefined,
      icon: CalendarClock,
      iconTone: d.overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
      badge: {
        label: d.overdue ? 'Overdue' : 'Upcoming',
        variant: d.overdue ? 'destructive' : 'default'
      },
      meta: `Due ${d.text}`
    })
  }

  for (const f of done) {
    entries.push({
      id: f.id,
      label: f.title,
      date: f.completedAt!,
      icon: CheckCircle2,
      iconTone: 'bg-success/15 text-success',
      badge: { label: 'Done', variant: 'success' },
      meta: f.extensionReason ? `Extended: ${f.extensionReason}` : undefined,
      description: f.notes || undefined
    })
  }

  for (const f of cancelled) {
    entries.push({
      id: f.id,
      label: f.title,
      date: f.cancelledAt!,
      icon: XCircle,
      iconTone: 'bg-destructive/10 text-destructive',
      badge: { label: 'Cancelled', variant: 'destructive' }
    })
  }

  return entries
}
