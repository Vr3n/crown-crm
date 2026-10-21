import { z } from 'zod'
import { updateOrgLogo, deleteOrgLogo, getOrgLogo } from '../application/organization-logo'
import { updateOrgLogoInputSchema } from '../../shared/contracts/organization-logo'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerOrgLogoIpc(): void {
  handle(IPC_CHANNELS.ORG_LOGO_UPDATE, updateOrgLogoInputSchema, (input) => updateOrgLogo(input))
  handle(IPC_CHANNELS.ORG_LOGO_DELETE, z.object({}), () => {
    deleteOrgLogo()
    return { deleted: true }
  })
  handle(IPC_CHANNELS.ORG_LOGO_GET, z.object({}), () => getOrgLogo())
}
