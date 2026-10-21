import { describe, it, expect } from 'vitest'
import { buildFollowUpRows, sortFollowUpRows } from '@/features/followups/build'
import type { FollowUpRow } from '@/features/followups/types'
import type { Lead } from '@/features/leads/types'

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 1,
    personId: 1,
    name: 'Alice',
    phone: '9000000000',
    email: 'a@x.com',
    stage: 'NEW',
    isBlacklisted: false,
    followUps: [{ id: 1, leadId: 1, title: 'Call', dueAt: '2026-01-02' }],
    createdAt: new Date().toISOString(),
    sourceId: 1,
    ...overrides
  } as unknown as Lead
}

describe('buildFollowUpRows', () => {
  it('propagates the person blacklist flag onto follow-up rows', () => {
    const rows = buildFollowUpRows([lead({ isBlacklisted: true })])
    expect(rows).toHaveLength(1)
    expect(rows[0].isBlacklisted).toBe(true)
    expect(rows[0].personId).toBe(1)
  })

  it('defaults blacklist to false', () => {
    const rows = buildFollowUpRows([lead({})])
    expect(rows[0].isBlacklisted).toBe(false)
  })
})

function followUpRow(overrides: Partial<FollowUpRow>): FollowUpRow {
  return {
    id: 1,
    leadId: 1,
    leadName: 'Alice',
    personId: 1,
    stage: 'NEW',
    isBlacklisted: false,
    title: 'Call',
    dueAt: '2099-01-02T10:00:00.000Z',
    completedAt: undefined,
    cancelledAt: undefined,
    ownerName: 'Priya',
    ...overrides
  }
}

describe('sortFollowUpRows', () => {
  it('puts open rows first even when a done row has an older due date', () => {
    const done = followUpRow({
      id: 1,
      dueAt: '2020-05-01T10:00:00.000Z',
      completedAt: '2026-09-01T10:00:00.000Z'
    })
    const open = followUpRow({ id: 2, dueAt: '2099-03-01T10:00:00.000Z' })
    expect(sortFollowUpRows([done, open]).map((r) => r.id)).toEqual([2, 1])
  })

  it('orders open rows by due date, earliest first', () => {
    const later = followUpRow({ id: 1, dueAt: '2099-03-01T10:00:00.000Z' })
    const earlier = followUpRow({ id: 2, dueAt: '2099-01-01T10:00:00.000Z' })
    expect(sortFollowUpRows([later, earlier]).map((r) => r.id)).toEqual([2, 1])
  })

  it('orders done rows by completion time, newest first', () => {
    const older = followUpRow({
      id: 1,
      completedAt: '2026-08-01T10:00:00.000Z'
    })
    const newer = followUpRow({
      id: 2,
      completedAt: '2026-09-01T10:00:00.000Z'
    })
    expect(sortFollowUpRows([older, newer]).map((r) => r.id)).toEqual([2, 1])
  })

  it('treats cancelled rows as done and sinks them', () => {
    const cancelled = followUpRow({
      id: 1,
      cancelledAt: '2026-09-01T10:00:00.000Z'
    })
    const open = followUpRow({ id: 2 })
    expect(sortFollowUpRows([cancelled, open]).map((r) => r.id)).toEqual([2, 1])
  })
})
