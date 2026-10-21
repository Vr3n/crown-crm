import { MemoryRouter } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FollowUpDialog } from '@/features/leads/components/follow-up-dialog'
import { LogActivityDialog } from '@/features/leads/components/log-activity-dialog'
import { EditFollowUpDialog } from '@/features/leads/components/edit-follow-up-dialog'
import { LeadsPage } from '@/features/leads/pages/LeadsPage'
import { SessionProvider } from '@/context/session-context'
import type { SessionContextValue } from '@/context/session-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Lead, StageKey } from '@/features/leads/types'
import type { FollowUpRow } from '@/features/followups/types'
import type { LeadListResponse, LeadListRow } from '../../src/shared/contracts/sales'
import { renderWithClient } from './setup'

/**
 * Terminal-stage soft gate: scheduling a follow-up, logging an activity, or
 * extending a follow-up for a WON/LOST lead asks for an explicit confirmation
 * first (win-back is supported, but never accidental). Non-terminal leads
 * submit straight through with no confirm step.
 */

function lead(stage: StageKey, stageId: number): Lead {
  return {
    id: 5,
    personId: 5,
    name: 'Giovanni Castrovilli',
    isBlacklisted: false,
    source: 'WALK_IN',
    sourceId: 1,
    stage,
    stageId,
    createdAt: new Date().toISOString(),
    activities: [],
    followUps: [],
    stageHistory: []
  }
}

function followUpRow(stage: FollowUpRow['stage']): FollowUpRow {
  return {
    id: 21,
    leadId: 5,
    leadName: 'Giovanni Castrovilli',
    personId: 5,
    stage,
    isBlacklisted: false,
    title: 'Catchup for interest',
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  }
}

/**
 * Opens the DateTimePicker popover, advances a month, and picks a day — the
 * single dialogs reject past dates, so a next-month day is always valid.
 */
async function pickDueDate(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole('button', { name: /Due/ }))
  const popover = await waitFor(() => {
    const el = document.querySelector('[data-slot="popover-content"]')
    if (!el) throw new Error('date picker did not open')
    return el as HTMLElement
  })
  await user.click(within(popover).getByRole('button', { name: 'Go to the Next Month' }))
  const day = within(popover)
    .getAllByRole('button')
    .find((b) => /^\d{1,2}$/.test(b.textContent?.trim() ?? ''))
  expect(day).toBeDefined()
  await user.click(day!)
}

const bulkSession: SessionContextValue = {
  organizationId: 1,
  organizationSlug: 'demo-gym',
  organizationName: 'Demo Gym',
  userId: 1,
  userFullName: 'Priya Verma',
  userEmail: 'priya@demo.com',
  roleId: 1,
  roleName: 'Manager',
  isSuper: false,
  permissions: ['lead.view', 'lead.delete', 'lead.update_stage', 'followup.create'],
  onSignOut: vi.fn()
}

function pageRow(id: number, name: string, stage: { id: number; name: string }): LeadListRow {
  return {
    id,
    personId: id,
    personName: name,
    phone: `9876500${String(id).padStart(4, '0')}`,
    email: null,
    sourceId: 1,
    sourceName: 'Walk-in',
    stageId: stage.id,
    stageName: stage.name,
    isWon: false,
    isLost: stage.name === 'LOST',
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

describe('ConfirmDialog', () => {
  it('confirms and cancels through its callbacks', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    renderWithClient(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Schedule for a Lost lead?"
        description="Giovanni is on the Lost stage."
        confirmLabel="Schedule anyway"
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('Schedule for a Lost lead?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Schedule anyway' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('disables the confirm button while pending', () => {
    renderWithClient(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="T"
        description="D"
        isPending
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })
})

describe('terminal scheduling confirm', () => {
  it(
    'asks for confirmation before scheduling for a LOST lead, then submits',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup()
      renderWithClient(<FollowUpDialog open onOpenChange={vi.fn()} lead={lead('LOST', 9)} />)

      await user.type(screen.getByLabelText(/What to do/), 'Win-back call')
      await pickDueDate(user)
      await user.click(screen.getByRole('button', { name: 'Schedule' }))

      // Confirm step first — the mutation must wait for it.
      await screen.findByText('Schedule for a Lost lead?')
      expect(window.api.leads.scheduleFollowup).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Schedule anyway' }))
      await waitFor(() => {
        expect(window.api.leads.scheduleFollowup).toHaveBeenCalledWith(
          expect.objectContaining({ leadId: 5, title: 'Win-back call' })
        )
      })
    }
  )

  it('submits straight through for an open-stage lead', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    renderWithClient(<FollowUpDialog open onOpenChange={vi.fn()} lead={lead('NEW', 1)} />)

    await user.type(screen.getByLabelText(/What to do/), 'Intro call')
    await pickDueDate(user)
    await user.click(screen.getByRole('button', { name: 'Schedule' }))

    await waitFor(() => {
      expect(window.api.leads.scheduleFollowup).toHaveBeenCalledWith(
        expect.objectContaining({ leadId: 5, title: 'Intro call' })
      )
    })
    expect(screen.queryByText(/for a .* lead\?/)).not.toBeInTheDocument()
  })

  it(
    'asks for confirmation before logging for a LOST lead, then submits',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup()
      renderWithClient(<LogActivityDialog open onOpenChange={vi.fn()} lead={lead('LOST', 9)} />)

      await user.type(screen.getByLabelText('Note'), 'Called, wants to return')
      await user.click(screen.getByRole('button', { name: 'Log activity' }))

      await screen.findByText('Log for a Lost lead?')
      expect(window.api.leads.recordActivity).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Log anyway' }))
      await waitFor(() => {
        expect(window.api.leads.recordActivity).toHaveBeenCalledWith(
          expect.objectContaining({ leadId: 5 })
        )
      })
    }
  )

  it(
    'asks for confirmation before bulk scheduling that includes a LOST lead',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup()
      const response: LeadListResponse = {
        items: [
          pageRow(1, 'Rahul Mehta', { id: 1, name: 'NEW' }),
          pageRow(2, 'Giovanni Castrovilli', { id: 9, name: 'LOST' })
        ],
        page: 1,
        limit: 200,
        total: 2,
        hasMore: false
      }
      vi.mocked(window.api.leads.list).mockResolvedValue(response)
      renderWithClient(
        <MemoryRouter>
          <TooltipProvider>
            <SessionProvider value={bulkSession} onSignOut={vi.fn()}>
              <LeadsPage />
            </SessionProvider>
          </TooltipProvider>
        </MemoryRouter>
      )

      await screen.findByText('Giovanni Castrovilli')
      await user.click(screen.getByRole('checkbox', { name: 'Select all leads' }))
      await user.click(screen.getByRole('button', { name: 'Schedule follow-up' }))

      await screen.findByRole('dialog', { name: /Schedule follow-ups/ })
      await user.type(screen.getByLabelText(/What to do/), 'Win-back wave')
      await pickDueDate(user)
      await user.click(screen.getByRole('button', { name: 'Schedule' }))

      await screen.findByText('Schedule for terminal-stage leads?')
      expect(window.api.leads.bulkScheduleFollowup).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Schedule anyway' }))
      await waitFor(() => {
        expect(window.api.leads.bulkScheduleFollowup).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Win-back wave' })
        )
      })
    }
  )

  it(
    'asks for confirmation before extending a LOST lead follow-up, then submits',
    { timeout: 20_000 },
    async () => {
      const user = userEvent.setup()
      renderWithClient(
        <EditFollowUpDialog open onOpenChange={vi.fn()} followUp={followUpRow('LOST')} />
      )

      await user.click(screen.getByRole('button', { name: 'Extend follow-up' }))

      await screen.findByText('Extend for a Lost lead?')
      expect(window.api.leads.updateFollowup).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Extend anyway' }))
      await waitFor(() => {
        expect(window.api.leads.updateFollowup).toHaveBeenCalledWith(
          expect.objectContaining({ followupId: 21 })
        )
      })
    }
  )
})
