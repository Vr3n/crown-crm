import { MemoryRouter } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LeadsPage } from '@/features/leads/pages/LeadsPage'
import type { LeadListResponse, LeadListRow } from '../../src/shared/contracts/sales'
import { renderWithClient } from './setup'

/**
 * The selection toolbar (Delete / Move Stage) only appears while rows are
 * selected in the table view. These tests exercise the lift of selection to the
 * page: checkbox toggle, intersection move options, delete confirmation, and
 * that both actions clear the selection on success.
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
  permissions: [
    'lead.view',
    'lead.delete',
    'lead.edit',
    'lead.update_stage',
    'followup.create',
    'lead.record_activity'
  ],
  onSignOut: vi.fn()
}

// Mirrors the Front Desk starter role: read-only, no stage moves, no deletes.
const frontDeskSession: SessionContextValue = {
  ...managerSession,
  roleName: 'Front Desk',
  permissions: ['lead.view']
}

function leadRow(id: number, name: string): LeadListRow {
  return {
    id,
    personId: id,
    personName: name,
    phone: `9876500${String(id).padStart(4, '0')}`,
    email: null,
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
  return {
    items: rows,
    page: 1,
    limit: 200,
    total: rows.length,
    hasMore: false
  }
}

function renderPage(
  session: SessionContextValue = managerSession
): ReturnType<typeof renderWithClient> {
  vi.mocked(window.api.leads.list).mockResolvedValue(
    listResponse([leadRow(1, 'Rahul Mehta'), leadRow(2, 'Bina Sen')])
  )
  return renderWithClient(
    <MemoryRouter>
      <TooltipProvider>
        <SessionProvider value={session} onSignOut={vi.fn()}>
          <LeadsPage />
        </SessionProvider>
      </TooltipProvider>
    </MemoryRouter>
  )
}

/** Opens the DateTimePicker popover and picks the first visible day cell. */
async function pickDueDate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  // The trigger's accessible name is its field label ("Due"), not the
  // placeholder, because the Field wires htmlFor to the trigger's id.
  await user.click(screen.getByRole('button', { name: /Due/ }))
  const popover = await waitFor(() => {
    const el = document.querySelector('[data-slot="popover-content"]')
    if (!el) throw new Error('date picker did not open')
    return el as HTMLElement
  })
  const day = within(popover)
    .getAllByRole('button')
    .find((b) => /^\d{1,2}$/.test(b.textContent?.trim() ?? ''))
  expect(day).toBeDefined()
  await user.click(day!)
}

describe('LeadsPage selection toolbar', () => {
  it('shows the toolbar only when rows are selected, and clears it on deselect', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Rahul Mehta')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule follow-up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule activity' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Move stage' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })

  it('schedules a follow-up for every selected lead', { timeout: 15_000 }, async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.bulkScheduleFollowup).mockResolvedValue({ scheduled: 2 })
    renderPage()

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    await user.click(screen.getByRole('button', { name: 'Schedule follow-up' }))

    await screen.findByRole('dialog', { name: /Schedule follow-ups/ })
    await user.type(screen.getByLabelText(/What to do/), 'Re-call for trial')

    await pickDueDate(user)

    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    await waitFor(() => {
      expect(window.api.leads.bulkScheduleFollowup).toHaveBeenCalledWith(
        expect.objectContaining({
          leadIds: expect.arrayContaining([1, 2]),
          title: 'Re-call for trial'
        })
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    })
  })

  it('logs an activity for every selected lead', { timeout: 15_000 }, async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.bulkRecordActivity).mockResolvedValue({ recorded: 2 })
    renderPage()

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    await user.click(screen.getByRole('button', { name: 'Schedule activity' }))

    await screen.findByRole('dialog', { name: /Log activities/ })
    await user.type(screen.getByLabelText('Note'), 'Called to confirm trial')
    await user.click(screen.getByRole('button', { name: 'Log activities' }))

    await waitFor(() => {
      expect(window.api.leads.bulkRecordActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          leadIds: expect.arrayContaining([1, 2]),
          note: 'Called to confirm trial'
        })
      )
    })
    await waitFor(() => {
      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    })
  })

  it('moves all selected leads through the bulk move stage select', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))

    await user.click(screen.getByRole('combobox', { name: 'Move stage' }))
    await user.click(await screen.findByRole('option', { name: /Contacted/ }))

    // The strict-move flow opens a verification dialog that must be confirmed.
    await screen.findByRole('dialog', { name: /Move 2 leads/ })
    await user.click(screen.getByRole('button', { name: 'Move leads' }))

    await waitFor(() => {
      expect(window.api.leads.bulkMoveStage).toHaveBeenCalledWith({
        leadIds: expect.arrayContaining([1, 2]),
        targetStageId: 2, // CONTACTED in the setup reference data
        note: ''
      })
    })
    // Success clears the selection, hiding the toolbar again.
    await waitFor(() => {
      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    })
  })

  it('lists only stages reachable from every selected lead', async () => {
    const user = userEvent.setup()
    // Rahul is CONTACTED (skips NEW), Bina is NEW — the shared forward set is
    // everything after CONTACTED, so NEW/Contacted must not be offered.
    const rows = [
      {
        ...leadRow(1, 'Rahul Mehta'),
        stageId: 2,
        stageName: 'CONTACTED'
      },
      leadRow(2, 'Bina Sen')
    ]
    vi.mocked(window.api.leads.list).mockResolvedValue(listResponse(rows))
    renderWithClient(
      <MemoryRouter>
        <TooltipProvider>
          <SessionProvider value={managerSession} onSignOut={vi.fn()}>
            <LeadsPage />
          </SessionProvider>
        </TooltipProvider>
      </MemoryRouter>
    )

    await screen.findByText('Bina Sen')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    await user.click(screen.getByRole('combobox', { name: 'Move stage' }))

    // The badge + label render as one accessible name, so match on the label.
    expect(await screen.findByRole('option', { name: /Negotiation/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Contacted/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^New/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Won/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Lost/ })).not.toBeInTheDocument()
  })

  it('deletes selected leads after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.deleteLeads).mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    await screen.findByText('Delete 2 leads?')
    const dialog = await screen.findByRole('alertdialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(window.api.leads.deleteLeads).toHaveBeenCalledWith({
        leadIds: expect.arrayContaining([1, 2])
      })
    })
    await waitFor(() => {
      expect(screen.queryByText('2 selected')).not.toBeInTheDocument()
    })
  })

  it('hides the action buttons for roles without those permissions', async () => {
    const user = userEvent.setup()
    renderPage(frontDeskSession)

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))

    expect(screen.getByText('2 selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Move stage' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Schedule follow-up' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Schedule activity' })).not.toBeInTheDocument()
  })
})

/**
 * Edit is owner-or-admin: the table shows an icon-only action per owned row,
 * the board shows the same action in the card footer, and a role without
 * lead.edit sees neither the buttons nor the Actions column.
 */
describe('LeadsPage edit action', () => {
  it('shows an edit action for every owned lead in the table', async () => {
    renderPage()

    await screen.findByText('Rahul Mehta')
    expect(screen.getByRole('button', { name: 'Edit Rahul Mehta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Bina Sen' })).toBeInTheDocument()
  })

  it('hides the edit action for leads owned by someone else', async () => {
    const rows = [
      leadRow(1, 'Rahul Mehta'),
      { ...leadRow(2, 'Bina Sen'), ownerUserId: 2, ownerName: 'Sana Kapoor' }
    ]
    vi.mocked(window.api.leads.list).mockResolvedValue(listResponse(rows))
    renderWithClient(
      <MemoryRouter>
        <TooltipProvider>
          <SessionProvider value={managerSession} onSignOut={vi.fn()}>
            <LeadsPage />
          </SessionProvider>
        </TooltipProvider>
      </MemoryRouter>
    )

    await screen.findByText('Rahul Mehta')
    expect(screen.getByRole('button', { name: 'Edit Rahul Mehta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Bina Sen' })).not.toBeInTheDocument()
  })

  it('hides the Actions column entirely for roles without lead.edit', async () => {
    renderPage(frontDeskSession)

    await screen.findByText('Rahul Mehta')
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('opens the edit dialog prefilled and saves changes', { timeout: 15_000 }, async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.leads.editLead).mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Rahul Mehta')
    await user.click(screen.getByRole('button', { name: 'Edit Rahul Mehta' }))

    const dialog = await screen.findByRole('dialog', { name: /Edit lead/ })
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('Rahul Mehta')
    expect(within(dialog).getByLabelText(/Phone/)).toHaveValue('98765000001')
    expect(within(dialog).getByLabelText(/Source/)).toHaveTextContent('Walk-in')

    await user.clear(within(dialog).getByLabelText(/Name/))
    await user.type(within(dialog).getByLabelText(/Name/), 'Rahul Mehta Updated')
    // The seeded phone is 11 digits (invalid) — type a valid one to enable save.
    await user.clear(within(dialog).getByLabelText(/Phone/))
    await user.type(within(dialog).getByLabelText(/Phone/), '9876500001')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(window.api.leads.editLead).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 1, fullName: 'Rahul Mehta Updated', sourceId: 1 })
      )
    })
  })
})

/**
 * The source filter must mirror the org's reference data (the same vocabulary
 * the forms use) instead of the seeded constant list, so admin-added sources
 * show up here too. Selection is by source id, not the canonical key.
 */
describe('LeadsPage source filter', () => {
  it('lists sources from reference data and filters leads by source id', async () => {
    const user = userEvent.setup()
    const rows = [
      leadRow(1, 'Rahul Mehta'),
      { ...leadRow(2, 'Bina Sen'), sourceId: 2, sourceName: 'Instagram' }
    ]
    vi.mocked(window.api.leads.list).mockResolvedValue(listResponse(rows))
    renderWithClient(
      <MemoryRouter>
        <TooltipProvider>
          <SessionProvider value={managerSession} onSignOut={vi.fn()}>
            <LeadsPage />
          </SessionProvider>
        </TooltipProvider>
      </MemoryRouter>
    )

    await screen.findByText('Rahul Mehta')

    // "All sources" is selected by default, not the placeholder.
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveTextContent('All sources')

    await user.click(screen.getByRole('combobox', { name: 'Source' }))
    // Walk-in is in the reference data (source id 1); so are Instagram, Website, Other.
    expect(await screen.findByRole('option', { name: 'Walk-in' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Instagram' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Website' })).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'Instagram' }))
    expect(screen.queryByText('Rahul Mehta')).not.toBeInTheDocument()
    expect(screen.getByText('Bina Sen')).toBeInTheDocument()
  })
})
