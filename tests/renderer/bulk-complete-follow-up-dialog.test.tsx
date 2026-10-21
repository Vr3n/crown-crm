import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BulkCompleteFollowUpDialog } from '@/features/followups/components/bulk-complete-follow-up-dialog'
import type { FollowUpRow } from '@/features/followups/types'
import { renderWithClient } from './setup'

/**
 * BulkCompleteFollowUpDialog: like the leads bulk toolbar, the optional
 * "Change Status?" move offers only the stages every selected follow-up's lead
 * can move to (the safe intersection). LOST leads are included (win-back); it
 * is hidden only when a WON lead is selected — the batch could never apply.
 * One submit sends a single bulk completion call for the whole selection.
 */

function row(id: number, stage: FollowUpRow['stage'] = 'NEW'): FollowUpRow {
  return {
    id,
    leadId: id,
    leadName: `Lead ${id}`,
    personId: id,
    stage,
    isBlacklisted: false,
    title: 'Call back',
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  }
}

function renderDialog(rows: FollowUpRow[]): void {
  renderWithClient(
    <BulkCompleteFollowUpDialog open onOpenChange={vi.fn()} rows={rows} onSuccess={vi.fn()} />
  )
}

const changeTrigger = (): HTMLElement => screen.getByRole('combobox', { name: /Change Status\?/ })
const markDoneButton = (): HTMLElement => screen.getByRole('button', { name: 'Mark done' })

describe('BulkCompleteFollowUpDialog', () => {
  it('shows the selection count and the optional Change Status? select', async () => {
    renderDialog([row(11), row(12), row(13)])

    expect(
      screen.getByRole('heading', { name: /Mark follow-ups as done · 3 follow-ups/ })
    ).toBeInTheDocument()
    expect(changeTrigger()).toBeInTheDocument()
    expect(
      await screen.findByText('Optional — change the pipeline stage for all selected leads')
    ).toBeInTheDocument()
  })

  it('shows the stage select when a selected lead is LOST (win-back)', () => {
    renderDialog([row(11, 'NEW'), row(12, 'LOST')])

    expect(changeTrigger()).toBeInTheDocument()
  })

  it('hides the stage select when any selected lead is WON', () => {
    renderDialog([row(11, 'NEW'), row(12, 'WON')])

    expect(screen.queryByRole('combobox', { name: /Change Status\?/ })).not.toBeInTheDocument()
  })

  it('submits one bulk call with a stageChange when a target is chosen', async () => {
    renderDialog([row(11), row(12)])
    const user = userEvent.setup()

    await user.click(changeTrigger())
    await user.click(await screen.findByRole('option', { name: /Contacted/ }))
    await user.click(markDoneButton())

    await waitFor(() => {
      expect(vi.mocked(window.api.leads.bulkCompleteFollowups)).toHaveBeenCalledWith({
        followUpIds: [11, 12],
        stageChange: { targetStageId: 2 }
      })
    })
  })

  it('submits without a stageChange when no target is chosen', async () => {
    renderDialog([row(11), row(12)])
    const user = userEvent.setup()

    await user.click(markDoneButton())

    await waitFor(() => {
      expect(vi.mocked(window.api.leads.bulkCompleteFollowups)).toHaveBeenCalledWith({
        followUpIds: [11, 12],
        stageChange: undefined
      })
    })
  })
})
