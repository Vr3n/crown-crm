import { useLeads } from '@/features/leads/queries'
import { buildActivityRows } from './build'
import type { ActivityRow } from './types'

/** Read model for the global activity audit — derived from the shared leads query. */
export function useActivityRows(): { rows: ActivityRow[]; isLoading: boolean } {
  const { data, isLoading } = useLeads()
  const rows = data ? buildActivityRows(data) : []
  return { rows, isLoading }
}
