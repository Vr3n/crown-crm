import type { ActivityTypeKey, StageKey } from '@/features/leads/types'

/**
 * Activities page types (Module 01 §24). Activities are *history* — immutable,
 * timestamped interactions. Rows flatten every lead's activities into one
 * chronological audit, each carrying its lead context for navigation.
 */
export interface ActivityRow {
  id: number
  leadId: number
  leadName: string
  stage: StageKey
  type: ActivityTypeKey
  note?: string
  at: string
  by?: string
}

export interface ActivityFilters {
  type: ActivityTypeKey | 'ALL'
  ownerId: string
  range: 'today' | 'week' | 'month' | 'all'
  search: string
}
