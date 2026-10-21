import { describe, it, expect } from 'vitest'
import type { Row } from '@tanstack/react-table'
import type { DashboardFeatures } from '@/features/dashboard/components/data-table'
import { dueAtOpenFirst } from '@/features/followups/build'
import type { FollowUpRow } from '@/features/followups/types'

function row(overrides: Partial<FollowUpRow>): FollowUpRow {
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

type SortRow = Row<DashboardFeatures, FollowUpRow>

function fakeRow(data: FollowUpRow, desc: boolean): SortRow {
  return {
    original: data,
    table: { atoms: { sorting: { get: () => [{ id: 'dueAt', desc }] } } }
  } as unknown as SortRow
}

const openEarly = row({ id: 1, dueAt: '2099-01-01T10:00:00.000Z' })
const openLate = row({ id: 2, dueAt: '2099-03-01T10:00:00.000Z' })
const done = row({
  id: 3,
  dueAt: '2020-05-01T10:00:00.000Z',
  completedAt: '2026-09-01T10:00:00.000Z'
})

describe('dueAtOpenFirst', () => {
  it('sorts open rows before done rows when ascending', () => {
    expect(dueAtOpenFirst(fakeRow(openLate, false), fakeRow(done, false), 'dueAt')).toBeLessThan(0)
    expect(dueAtOpenFirst(fakeRow(done, false), fakeRow(openLate, false), 'dueAt')).toBeGreaterThan(
      0
    )
  })

  it('keeps done rows sunk when descending (counters the engine inversion)', () => {
    // The engine negates the comparator on desc, so the partition is returned
    // pre-negated: open-vs-done yields > 0 here, which the engine flips back.
    expect(dueAtOpenFirst(fakeRow(openLate, true), fakeRow(done, true), 'dueAt')).toBeGreaterThan(0)
    expect(dueAtOpenFirst(fakeRow(done, true), fakeRow(openLate, true), 'dueAt')).toBeLessThan(0)
  })

  it('orders within a partition by due date ascending (engine flips for desc)', () => {
    expect(
      dueAtOpenFirst(fakeRow(openEarly, false), fakeRow(openLate, false), 'dueAt')
    ).toBeLessThan(0)
    expect(dueAtOpenFirst(fakeRow(openEarly, true), fakeRow(openLate, true), 'dueAt')).toBeLessThan(
      0
    )
  })

  it('treats cancelled rows as done', () => {
    const cancelled = row({ id: 4, cancelledAt: '2026-09-01T10:00:00.000Z' })
    expect(
      dueAtOpenFirst(fakeRow(openLate, false), fakeRow(cancelled, false), 'dueAt')
    ).toBeLessThan(0)
  })
})
