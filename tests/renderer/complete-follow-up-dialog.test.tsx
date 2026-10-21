import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CompleteFollowUpDialog } from '@/features/followups/components/complete-follow-up-dialog'
import type { FollowUpRow } from '@/features/followups/types'
import { renderWithClient } from './setup'

/**
 * CompleteFollowUpDialog: the optional "Change Status?" move mirrors the Record
 * Activity form's — it is shown for every stage except WON (LOST leads can be
 * won back) and, when a target is picked, submits a `stageChange` (target +
 * expected current stage) in the same atomic completion call. With no
 * selection it submits no stage change at all.
 */

function row(stage: FollowUpRow['stage'] = 'NEW'): FollowUpRow {
  return {
    id: 11,
    leadId: 1,
    leadName: 'Rahul Mehta',
    personId: 1,
    stage,
    isBlacklisted: false,
    title: 'Call back',
    dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
  }
}

function renderDialog(stage: FollowUpRow['stage'] = 'NEW'): {
  onOpenChange: ReturnType<typeof vi.fn>
} {
  const onOpenChange = vi.fn()
  renderWithClient(
    <CompleteFollowUpDialog open onOpenChange={onOpenChange} followUp={row(stage)} />
  )
  return { onOpenChange }
}

const changeTrigger = (): HTMLElement => screen.getByRole('combobox', { name: /Change Status\?/ })
const markDoneButton = (): HTMLElement => screen.getByRole('button', { name: 'Mark done' })

describe('CompleteFollowUpDialog', () => {
  it('shows the optional Change Status? select for a non-terminal stage', async () => {
    renderDialog('NEW')

    expect(changeTrigger()).toBeInTheDocument()
    expect(
      await screen.findByText('Optional — change the pipeline stage at the same time')
    ).toBeInTheDocument()
  })

  it('shows the stage select for a LOST lead so it can be won back', async () => {
    renderDialog('LOST')

    expect(changeTrigger()).toBeInTheDocument()
    expect(
      await screen.findByText('Optional — change the pipeline stage at the same time')
    ).toBeInTheDocument()
  })

  it('hides the stage select for a WON lead, which stays absorbing', () => {
    renderDialog('WON')

    expect(screen.queryByRole('combobox', { name: /Change Status\?/ })).not.toBeInTheDocument()
  })

  it('submits stageChange when a target stage is chosen', async () => {
    renderDialog('NEW')
    const user = userEvent.setup()

    await user.click(changeTrigger())
    await user.click(await screen.findByRole('option', { name: /Contacted/ }))
    await user.click(markDoneButton())

    await waitFor(() => {
      expect(vi.mocked(window.api.leads.completeFollowup)).toHaveBeenCalledWith({
        followupId: 11,
        notes: undefined,
        activity: undefined,
        stageChange: { targetStageId: 2, expectedStageId: 1 }
      })
    })
  })

  it('omits stageChange when no stage is chosen', async () => {
    renderDialog('NEW')
    const user = userEvent.setup()

    await user.click(markDoneButton())

    await waitFor(() => {
      expect(vi.mocked(window.api.leads.completeFollowup)).toHaveBeenCalledWith({
        followupId: 11,
        notes: undefined,
        activity: undefined,
        stageChange: undefined
      })
    })
  })
})
