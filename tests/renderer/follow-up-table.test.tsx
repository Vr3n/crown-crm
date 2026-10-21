import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { FollowUpTable } from '@/features/followups/components/follow-up-table'
import type { FollowUpRow } from '@/features/followups/types'
import { renderWithClient } from './setup'

/**
 * Follow-ups table ordering: open rows surface first (earliest due), done and
 * cancelled rows sink — by default and under manual Due sorts in both
 * directions. The done rows below carry deliberately old due dates so a plain
 * due-date sort would interleave them with the open rows.
 */

function row(overrides: Partial<FollowUpRow> & { id: number }): FollowUpRow {
  return {
    leadId: 1,
    leadName: 'Someone',
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

// Upstream order as FollowUpsPage provides it: open by due date, then done by
// completion time (newest first).
const rows: FollowUpRow[] = [
  row({ id: 1, leadId: 11, leadName: 'Arjun Rao', dueAt: '2099-01-02T10:00:00.000Z' }),
  row({ id: 2, leadId: 12, leadName: 'Zara Khan', dueAt: '2099-01-05T10:00:00.000Z' }),
  row({
    id: 3,
    leadId: 13,
    leadName: 'Meera Iyer',
    dueAt: '2020-05-01T10:00:00.000Z',
    completedAt: '2026-09-02T10:00:00.000Z'
  }),
  row({
    id: 4,
    leadId: 14,
    leadName: 'Kabir Shah',
    dueAt: '2020-04-01T10:00:00.000Z',
    cancelledAt: '2026-09-01T10:00:00.000Z'
  })
]

function bodyText(): string {
  // First row is the thead header; the rest are body rows in render order.
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => r.textContent ?? '')
    .join('\n')
}

function expectOrder(text: string, names: string[]): void {
  const positions = names.map((n) => text.indexOf(n))
  for (const [i, pos] of positions.entries()) {
    expect(pos, `${names[i]} should be rendered`).toBeGreaterThanOrEqual(0)
    if (i > 0)
      expect(pos, `${names[i]} should come after ${names[i - 1]}`).toBeGreaterThan(positions[i - 1])
  }
}

beforeEach(() => {
  Object.assign(window.api, {
    person: { getPhotos: vi.fn().mockResolvedValue({ photos: {} }) }
  })
})

function renderTable(): void {
  renderWithClient(
    <TooltipProvider>
      <FollowUpTable rows={rows} bucket="all" isLoading={false} onOpenLead={vi.fn()} />
    </TooltipProvider>
  )
}

describe('FollowUpTable ordering', () => {
  it('renders open rows before done rows by default', () => {
    renderTable()
    expectOrder(bodyText(), ['Arjun Rao', 'Zara Khan', 'Meera Iyer', 'Kabir Shah'])
  })

  it('keeps done rows sunk on ascending Due sort', async () => {
    const user = userEvent.setup()
    renderTable()
    await user.click(screen.getByRole('button', { name: 'Due' }))
    // Done rows order by due date here (Kabir's April due predates Meera's
    // May one) — unlike the default newest-completed-first order.
    expectOrder(bodyText(), ['Arjun Rao', 'Zara Khan', 'Kabir Shah', 'Meera Iyer'])
  })

  it('keeps done rows sunk on descending Due sort', async () => {
    const user = userEvent.setup()
    renderTable()
    const due = screen.getByRole('button', { name: 'Due' })
    await user.click(due)
    await user.click(due)
    // Open rows flip to latest-due first; done rows stay at the bottom,
    // ordered latest-due first within their partition.
    expectOrder(bodyText(), ['Zara Khan', 'Arjun Rao', 'Meera Iyer', 'Kabir Shah'])
  })
})
