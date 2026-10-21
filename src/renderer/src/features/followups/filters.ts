import type { FollowUpFilters, FollowUpRow } from './types'
import { bucketOf } from './build'

/**
 * Apply the follow-ups filter set: urgency bucket and free-text search (lead
 * name or the action itself). Runs upstream of the table so pagination and
 * search stay snappy.
 */
export function filterFollowUps(rows: FollowUpRow[], filters: FollowUpFilters): FollowUpRow[] {
  const q = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (filters.bucket !== 'all' && bucketOf(row) !== filters.bucket) return false
    if (q) {
      const hay = `${row.leadName} ${row.title}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
