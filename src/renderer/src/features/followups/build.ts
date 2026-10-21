import type { Row, SortFn } from '@tanstack/react-table'
import type { DashboardFeatures } from '@/features/dashboard/components/data-table'
import type { Lead } from '@/features/leads/types'
import type { FollowUpBucket, FollowUpRow } from './types'

/**
 * Deterministic flattening of the leads list into one flat follow-up queue.
 * Each row carries its lead context (name, stage, owner) so the global page can
 * show "who / what / when" without a second round-trip.
 */
export function buildFollowUpRows(leads: Lead[]): FollowUpRow[] {
  return leads.flatMap((lead) =>
    lead.followUps.map((f) => ({
      id: f.id,
      leadId: lead.id,
      leadName: lead.name,
      personId: lead.personId,
      stage: lead.stage,
      isBlacklisted: lead.isBlacklisted,
      title: f.title,
      dueAt: f.dueAt,
      extensionReason: f.extensionReason,
      notes: f.notes,
      completedAt: f.completedAt,
      cancelledAt: f.cancelledAt,
      cancelledReason: f.cancelledReason,
      ownerId: lead.owner?.id,
      ownerName: lead.owner?.name
    }))
  )
}

function isSameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Urgency bucket for an open follow-up: overdue → today → upcoming. */
export function bucketOf(row: FollowUpRow): Exclude<FollowUpBucket, 'all'> {
  if (row.completedAt || row.cancelledAt) return 'done'
  const due = new Date(row.dueAt).getTime()
  if (due < Date.now()) return 'overdue'
  if (isSameCalendarDay(row.dueAt, new Date().toISOString())) return 'today'
  return 'upcoming'
}

/** Open first, earliest due first; done items by completion time, newest first. */
export function sortFollowUpRows(rows: FollowUpRow[]): FollowUpRow[] {
  return [...rows].sort((a, b) => {
    const aDone = a.completedAt || a.cancelledAt
    const bDone = b.completedAt || b.cancelledAt
    if (aDone && bDone)
      return (b.completedAt ?? b.cancelledAt ?? '').localeCompare(
        a.completedAt ?? a.cancelledAt ?? ''
      )
    if (aDone) return 1
    if (bDone) return -1
    return a.dueAt.localeCompare(b.dueAt)
  })
}

function isDoneRow(row: FollowUpRow): boolean {
  return Boolean(row.completedAt || row.cancelledAt)
}

function isDueDesc(row: Row<DashboardFeatures, FollowUpRow>, columnId: string): boolean {
  const sorting = row.table.atoms.sorting?.get() ?? []
  return sorting.some((entry) => entry.id === columnId && entry.desc)
}

/**
 * Due-column sort for the follow-ups table: open follow-ups always surface
 * above done/cancelled ones, in both directions — only the within-group
 * due-date order follows the sort direction. The engine negates the comparator
 * result on desc, so the open-first partition is applied direction-aware here
 * to counter that.
 */
export const dueAtOpenFirst: SortFn<DashboardFeatures, FollowUpRow> = (
  rowA,
  rowB,
  columnId
) => {
  const aDone = isDoneRow(rowA.original)
  const bDone = isDoneRow(rowB.original)
  if (aDone !== bDone) {
    const openFirst = aDone ? 1 : -1
    return isDueDesc(rowA, columnId) ? -openFirst : openFirst
  }
  return rowA.original.dueAt.localeCompare(rowB.original.dueAt)
}
