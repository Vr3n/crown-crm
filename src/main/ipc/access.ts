import {
  createRoleInputSchema,
  resetStaffPasswordInputSchema,
  roleIdSchema,
  updateRoleInputSchema,
  updateStaffInputSchema
} from '../../shared/contracts/access'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  listStaff,
  resetStaffPassword,
  updateRole,
  updateStaff
} from '../application/access'
import { handle } from './handle'

export function registerAccessIpc(): void {
  handle(IPC_CHANNELS.IDENTITY_STAFF, () => listStaff())
  handle(IPC_CHANNELS.IDENTITY_ROLES, () => listRoles())
  handle(IPC_CHANNELS.IDENTITY_PERMISSIONS, () => listPermissions())

  handle(IPC_CHANNELS.IDENTITY_UPDATE_STAFF, updateStaffInputSchema, (input) => updateStaff(input))
  handle(IPC_CHANNELS.IDENTITY_RESET_STAFF_PASSWORD, resetStaffPasswordInputSchema, (input) =>
    resetStaffPassword(input)
  )

  handle(IPC_CHANNELS.IDENTITY_ROLE_CREATE, createRoleInputSchema, (input) => createRole(input))
  handle(IPC_CHANNELS.IDENTITY_ROLE_UPDATE, updateRoleInputSchema, (input) => updateRole(input))
  handle(IPC_CHANNELS.IDENTITY_ROLE_DELETE, roleIdSchema, (input) => {
    deleteRole(input.id)
    return true
  })
}
