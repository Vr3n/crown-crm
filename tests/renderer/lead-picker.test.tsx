import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadPicker } from '@/features/leads/components/lead-picker'
import type { LeadListResponse, LeadListRow } from '../../src/shared/contracts/sales'
import { renderWithClient } from './setup'

/**
 * LeadPicker: the searchable lead combobox used before scheduling work. With
 * `excludeBlacklisted` (scheduling/activity dialogs, sale forms), blacklisted
 * people are not offered — the backend refuses them anyway (refunds only).
 */

function row(id: number, name: string, blacklisted: boolean): LeadListRow {
  return {
    id,
    personId: id,
    personName: name,
    phone: `9876500${String(id).padStart(4, '0')}`,
    email: null,
    isBlacklisted: blacklisted,
    blacklistedReason: blacklisted ? 'Fraud' : null,
    sourceId: 1,
    sourceName: 'Walk-in',
    stageId: 1,
    stageName: 'NEW',
    isWon: false,
    isLost: false,
    ownerUserId: 1,
    ownerName: 'Priya Verma',
    planId: null,
    planName: null,
    goal: null,
    notes: null,
    createdAt: new Date().toISOString(),
    lostReasonId: null,
    lostReasonName: null,
    lostAt: null,
    activities: [],
    followUps: [],
    stageHistory: []
  }
}

function listResponse(rows: LeadListRow[]): LeadListResponse {
  return { items: rows, page: 1, limit: 200, total: rows.length, hasMore: false }
}

async function openPicker(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('combobox'))
  await waitFor(() => {
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
  })
}

describe('LeadPicker', () => {
  it('excludes blacklisted leads when excludeBlacklisted is set', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.list).mockResolvedValue(
      listResponse([row(1, 'Rahul Mehta', false), row(2, 'Banned Bob', true)])
    )
    renderWithClient(<LeadPicker value={0} onChange={vi.fn()} excludeBlacklisted />)

    await openPicker(user)
    expect(screen.getByText('Rahul Mehta')).toBeInTheDocument()
    expect(screen.queryByText('Banned Bob')).not.toBeInTheDocument()
  })

  it('offers blacklisted leads otherwise', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.list).mockResolvedValue(
      listResponse([row(1, 'Rahul Mehta', false), row(2, 'Banned Bob', true)])
    )
    renderWithClient(<LeadPicker value={0} onChange={vi.fn()} />)

    await openPicker(user)
    expect(screen.getByText('Rahul Mehta')).toBeInTheDocument()
    expect(screen.getByText('Banned Bob')).toBeInTheDocument()
  })
})
