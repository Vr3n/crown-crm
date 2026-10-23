import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { updateNumberingInputSchema } from '../../shared/contracts/numbering'
import { completeOnboarding, listNumbering, updateNumbering } from '../application/numbering'
import { handle } from './handle'

export function registerNumberingIpc(): void {
  handle(IPC_CHANNELS.NUMBERING_LIST, () => listNumbering())
  handle(IPC_CHANNELS.NUMBERING_UPDATE, updateNumberingInputSchema, (input) =>
    updateNumbering(input)
  )
  handle(IPC_CHANNELS.ONBOARDING_COMPLETE, () => completeOnboarding())
}
