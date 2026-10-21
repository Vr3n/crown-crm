import { MemoryRouter } from 'react-router-dom'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import type { LeadListResponse, LeadListRow } from '../../src/shared/contracts/sales'
import { renderWithClient } from './setup'

// Warm the dashboard's lazily-loaded dialogs so a click resolves immediately
// instead of timing out on the first dynamic import (same pattern as setup.ts).
import '@/features/leads/components/edit-follow-up-dialog'
import '@/features/followups/components/cancel-follow-up-dialog'
import '@/features/leads/components/edit-lead-dialog'
import '@/features/people/components/blacklist-dialog'

/**
 * Dashboard row actions: the Recent leads card mirrors the leads domain table
 * (Edit + Blacklist, permission-gated), and the Upcoming followups card mirrors
 * the follow-ups domain table (Extend + Mark done + Cancel). Every action opens
 * its dialog and every icon-only button carries a tooltip.
 */

const managerSession: SessionContextValue = {
  organizationId: 1,
  organizationSlug: 'demo-gym',
  organizationName: 'Demo Gym',
  userId: 1,
  userFullName: 'Priya Verma',
  userEmail: 'priya@demo.com',
  roleId: 1,
  roleName: 'Manager',
  isSuper: false,
  permissions: ['lead.view', 'lead.edit', 'person.blacklist'],
  onSignOut: vi.fn()
}

// Mirrors the Front Desk starter role: read-only, no lead edits, no blacklist.
const frontDeskSession: SessionContextValue = {
  ...managerSession,
  roleName: 'Front Desk',
  permissions: ['lead.view']
}

function leadRow(id: number, name: string, followUps: LeadListRow['followUps'] = []): LeadListRow {
  return {
    id,
    personId: id,
    personName: name,
    phone: `9876500${String(id).padStart(4, '0')}`,
    email: null,
    isBlacklisted: false,
    blacklistedReason: null,
    photoFilename: null,
    sourceId: 1,
    sourceName: 'Walk-in',
    stageId: 1,
    stageName: 'NEW',
    isWon: false,
    isLost: false,
    ownerUserId: 1,
    ownerName: 'Priya Verma',
    customerId: null,
    planId: null,
    planName: null,
    goal: null,
    notes: null,
    createdAt: new Date().toISOString(),
    lostReasonId: null,
    lostReasonName: null,
    lostAt: null,
    activities: [],
    followUps,
    stageHistory: []
  }
}

function listResponse(rows: LeadListRow[]): LeadListResponse {
  return {
    items: rows,
    page: 1,
    limit: 200,
    total: rows.length,
    hasMore: false
  }
}

beforeEach(() => {
  // The member-data cards read through the dashboard IPC facade; the renderer
  // setup does not stub it, so keep those queues empty for these tests.
  Object.assign(window.api, {
    dashboard: {
      expirations: vi.fn().mockResolvedValue([]),
      paymentsDue: vi.fn().mockResolvedValue([]),
      memberRecord: vi.fn().mockResolvedValue(null),
      paymentRecord: vi.fn().mockResolvedValue(null)
    }
  })
})

function renderDashboard(
  session: SessionContextValue = managerSession
): ReturnType<typeof renderWithClient> {
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  vi.mocked(window.api.leads.list).mockResolvedValue(
    listResponse([
      leadRow(1, 'Rahul Mehta', [
        {
          id: 11,
          title: 'Call back',
          dueAt: inTwoDays,
          extensionReason: null,
          notes: null,
          completedAt: null,
          cancelledAt: null
        }
      ]),
      leadRow(2, 'Bina Sen')
    ])
  )
  return renderWithClient(
    <MemoryRouter>
      <TooltipProvider>
        <SessionProvider value={session} onSignOut={vi.fn()}>
          <DashboardPage />
        </SessionProvider>
      </TooltipProvider>
    </MemoryRouter>
  )
}

describe('DashboardPage upcoming followups actions', () => {
  it('shows Extend, Mark done and Cancel actions for the due follow-up', async () => {
    renderDashboard()

    expect(
      await screen.findByRole('button', { name: 'Extend due date for Call back' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark Call back done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Call back' })).toBeInTheDocument()
  })

  it('opens the extend dialog from the Extend action', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Extend due date for Call back' }))
    expect(await screen.findByRole('dialog', { name: /Extend follow-up/ })).toBeInTheDocument()
  })

  it('opens the cancel dialog from the Cancel action', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Cancel Call back' }))
    expect(await screen.findByRole('dialog', { name: /Cancel follow-up/ })).toBeInTheDocument()
  })

  it('opens the completion dialog from the Mark done action', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Mark Call back done' }))
    expect(await screen.findByRole('dialog', { name: /Mark follow-up done/ })).toBeInTheDocument()
  })
})

describe('DashboardPage recent leads actions', () => {
  it('shows Edit and Blacklist actions for recent leads', async () => {
    renderDashboard()

    expect(await screen.findByRole('button', { name: 'Edit Rahul Mehta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blacklist Rahul Mehta' })).toBeInTheDocument()
  })

  it('opens the edit dialog prefilled from the Edit action', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Edit Rahul Mehta' }))
    const dialog = await screen.findByRole('dialog', { name: /Edit lead/ })
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Rahul Mehta')
  })

  it('opens the blacklist dialog from the Blacklist action', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(await screen.findByRole('button', { name: 'Blacklist Rahul Mehta' }))
    expect(await screen.findByRole('dialog', { name: /Blacklist Rahul Mehta/ })).toBeInTheDocument()
  })

  it('hides Edit and Blacklist actions for roles without those permissions', async () => {
    renderDashboard(frontDeskSession)

    // Wait for the table to load before asserting absence.
    expect(await screen.findByText('Recent leads')).toBeInTheDocument()
    expect((await screen.findAllByText('Rahul Mehta')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Edit / })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Blacklist / })).not.toBeInTheDocument()
  })
})
