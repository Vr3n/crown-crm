import type { ActivityFilters, ActivityRow } from './types'

/**
 * Apply the activities audit filters: activity type, staff member (matched via
 * the activity's "by" name), date range and free-text search on lead + note.
 * The owner filter value is the staff member's display name, derived from the
 * rows themselves — there is no separate staff list on this page.
 */
export function filterActivities(rows: ActivityRow[], filters: ActivityFilters): ActivityRow[] {
  const now = Date.now()
  const cutoff =
    filters.range === 'today'
      ? now - 24 * 3600 * 1000
      : filters.range === 'week'
        ? now - 7 * 24 * 3600 * 1000
        : filters.range === 'month'
          ? now - 30 * 24 * 3600 * 1000
          : 0

  const q = filters.search.trim().toLowerCase()

  return rows.filter((row) => {
    if (new Date(row.at).getTime() < cutoff) return false
    if (filters.type !== 'ALL' && row.type !== filters.type) return false
    if (filters.ownerId !== 'ALL' && row.by !== filters.ownerId) return false
    if (q) {
      const hay = `${row.leadName} ${row.note ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
