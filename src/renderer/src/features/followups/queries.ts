import { useLeads } from '@/features/leads/queries'
import { useNow } from '@/lib/use-now'
import { buildFollowUpRows } from './build'
import type { FollowUpRow } from './types'

/**
 * Read model for the global follow-up queue. Derived from the shared leads list
 * query, so completing a follow-up invalidates ['leads'] and this updates
 * automatically. The sidebar badge count comes from here too.
 */
export function useFollowUpRows(): { rows: FollowUpRow[]; isLoading: boolean } {
  const { data, isLoading } = useLeads()
  const rows = data ? buildFollowUpRows(data) : []
  return { rows, isLoading }
}

/** Real "overdue follow-ups" count for the sidebar badge — 0 hides the badge. */
export function useOverdueFollowUpCount(): number {
  const { rows } = useFollowUpRows()
  const now = useNow()
  return rows.filter((r) => !r.completedAt && new Date(r.dueAt).getTime() < now).length
}
