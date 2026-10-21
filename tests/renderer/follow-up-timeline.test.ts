import { describe, it, expect } from 'vitest'
import { startOfDay, addDays } from 'date-fns'
import {
  filterOpenFollowUps,
  mapOpenFollowUpsToEntries
} from '../../src/renderer/src/features/dashboard/follow-up-timeline'
import type { FollowUpRow } from '../../src/renderer/src/features/followups/types'

const NOW = new Date()
const TODAY = startOfDay(NOW).toISOString()
const TOMORROW = addDays(NOW, 1).toISOString()
const YESTERDAY = new Date(NOW.getTime() - 86_400_000).toISOString()
const NEXT_WEEK = addDays(NOW, 7).toISOString()

function row(overrides: Partial<FollowUpRow>): FollowUpRow {
  return {
    id: 1,
    leadId: 10,
    leadName: 'Alice',
    stage: 'NEW',
    isBlacklisted: false,
    title: 'Call to confirm',
    dueAt: TOMORROW,
    ...overrides
  }
}

describe('filterOpenFollowUps', () => {
  it('excludes completed and cancelled follow-ups', () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, completedAt: YESTERDAY }),
      row({ id: 3, cancelledAt: YESTERDAY })
    ]
    const result = filterOpenFollowUps(rows, { leadId: 'ALL' })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('filters by specific leadId', () => {
    const rows = [
      row({ id: 1, leadId: 10 }),
      row({ id: 2, leadId: 20 }),
      row({ id: 3, leadId: 10 })
    ]
    const result = filterOpenFollowUps(rows, { leadId: 10 })
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.leadId === 10)).toBe(true)
  })

  it('shows all leads when leadId is ALL', () => {
    const rows = [row({ id: 1, leadId: 10 }), row({ id: 2, leadId: 20 })]
    const result = filterOpenFollowUps(rows, { leadId: 'ALL' })
    expect(result).toHaveLength(2)
  })

  it('filters by date range from', () => {
    const rows = [
      row({ id: 1, dueAt: YESTERDAY }),
      row({ id: 2, dueAt: TODAY }),
      row({ id: 3, dueAt: TOMORROW })
    ]
    const result = filterOpenFollowUps(rows, {
      leadId: 'ALL',
      range: { from: startOfDay(NOW) }
    })
    expect(result.map((r) => r.id)).toEqual([2, 3])
  })

  it('filters by date range to', () => {
    const rows = [
      row({ id: 1, dueAt: YESTERDAY }),
      row({ id: 2, dueAt: TODAY }),
      row({ id: 3, dueAt: TOMORROW })
    ]
    const result = filterOpenFollowUps(rows, {
      leadId: 'ALL',
      range: { to: startOfDay(NOW) }
    })
    expect(result.map((r) => r.id)).toEqual([1, 2])
  })

  it('filters by date range from and to', () => {
    const rows = [
      row({ id: 1, dueAt: YESTERDAY }),
      row({ id: 2, dueAt: TODAY }),
      row({ id: 3, dueAt: TOMORROW }),
      row({ id: 4, dueAt: NEXT_WEEK })
    ]
    const result = filterOpenFollowUps(rows, {
      leadId: 'ALL',
      range: { from: startOfDay(NOW), to: addDays(NOW, 1) }
    })
    expect(result.map((r) => r.id)).toEqual([2, 3])
  })

  it('shows all when range is undefined', () => {
    const rows = [row({ id: 1, dueAt: YESTERDAY }), row({ id: 2, dueAt: TOMORROW })]
    const result = filterOpenFollowUps(rows, { leadId: 'ALL', range: undefined })
    expect(result).toHaveLength(2)
  })

  it('sorts ascending by dueAt', () => {
    const rows = [
      row({ id: 1, dueAt: NEXT_WEEK }),
      row({ id: 2, dueAt: YESTERDAY }),
      row({ id: 3, dueAt: TOMORROW })
    ]
    const result = filterOpenFollowUps(rows, { leadId: 'ALL' })
    expect(result.map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('combines lead and date filters', () => {
    const rows = [
      row({ id: 1, leadId: 10, dueAt: YESTERDAY }),
      row({ id: 2, leadId: 10, dueAt: TOMORROW }),
      row({ id: 3, leadId: 20, dueAt: TOMORROW })
    ]
    const result = filterOpenFollowUps(rows, {
      leadId: 10,
      range: { from: startOfDay(NOW) }
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
  })
})

describe('mapOpenFollowUpsToEntries', () => {
  it('maps rows to timeline entries', () => {
    const rows = [row({ id: 5, title: 'Send pricing', leadName: 'Bob', dueAt: TOMORROW })]
    const entries = mapOpenFollowUpsToEntries(rows)
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe(5)
    expect(entries[0].label).toBe('Send pricing')
    expect(entries[0].description).toBe('Bob')
    expect(entries[0].badge?.label).toBe('Upcoming')
  })

  it('marks overdue entries with destructive tone', () => {
    const rows = [row({ id: 1, dueAt: YESTERDAY })]
    const entries = mapOpenFollowUpsToEntries(rows)
    expect(entries[0].badge?.label).toBe('Overdue')
    expect(entries[0].badge?.variant).toBe('destructive')
    expect(entries[0].iconTone).toContain('destructive')
  })

  it('marks upcoming entries with primary tone', () => {
    const rows = [row({ id: 1, dueAt: TOMORROW })]
    const entries = mapOpenFollowUpsToEntries(rows)
    expect(entries[0].badge?.label).toBe('Upcoming')
    expect(entries[0].badge?.variant).toBe('default')
    expect(entries[0].iconTone).toContain('primary')
  })

  it('returns empty array for empty input', () => {
    expect(mapOpenFollowUpsToEntries([])).toEqual([])
  })
})
