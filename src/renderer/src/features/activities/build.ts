import { formatDate } from '@/features/leads/format'
import type { Lead } from '@/features/leads/types'
import type { ActivityRow } from './types'

/** Flatten every lead's activities into one chronological audit. */
export function buildActivityRows(leads: Lead[]): ActivityRow[] {
  return leads.flatMap((lead) =>
    lead.activities.map((a) => ({
      id: a.id,
      leadId: lead.id,
      leadName: lead.name,
      stage: lead.stage,
      type: a.type,
      note: a.note,
      at: a.at,
      by: a.by
    }))
  )
}

export function sortActivityRows(rows: ActivityRow[]): ActivityRow[] {
  return [...rows].sort((a, b) => b.at.localeCompare(a.at))
}

export interface ActivityDayGroup {
  /** Calendar-day sort key (YYYY-MM-DD). */
  key: string
  /** Human label: Today / Yesterday / "14 Aug 2026". */
  label: string
  items: ActivityRow[]
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Group a sorted (newest-first) activity list by calendar day. */
export function groupByDay(rows: ActivityRow[]): ActivityDayGroup[] {
  const nowKey = dayKey(new Date().toISOString())
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
  const yesterdayKey = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(
    yesterday.getDate()
  )}`

  const groups = new Map<string, ActivityDayGroup>()
  for (const row of rows) {
    const key = dayKey(row.at)
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        label: key === nowKey ? 'Today' : key === yesterdayKey ? 'Yesterday' : formatDate(row.at),
        items: []
      }
      groups.set(key, group)
    }
    group.items.push(row)
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key))
}
