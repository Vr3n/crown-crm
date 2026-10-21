import { blacklistPerson, unblacklistPerson } from '../application/blacklist'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'
import { z } from 'zod'

const blacklistToggleSchema = z.object({
  personId: z.number().int().positive(),
  action: z.enum(['blacklist', 'unblacklist']),
  reason: z.string().max(500).nullable()
})

export function registerBlacklistIpc(): void {
  handle(IPC_CHANNELS.PERSON_BLACKLIST_TOGGLE, blacklistToggleSchema, (input) => {
    if (input.action === 'blacklist') {
      return blacklistPerson({ personId: input.personId, reason: input.reason })
    }
    return unblacklistPerson({ personId: input.personId })
  })
}
