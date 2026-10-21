import {
  setupCompany,
  login,
  createStaffMember,
  updateCompany,
  getAuthStatus,
  logout,
  checkCompanyExists
} from '../application/identity'
import { getSession } from '../auth/session'
import type { SessionContext } from '../../shared/contracts/identity'
import {
  createStaffMemberInputSchema,
  loginInputSchema,
  companyExistenceInputSchema,
  setupCompanyInputSchema,
  updateCompanyInputSchema
} from '../../shared/contracts/identity'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerIdentityIpc(): void {
  handle(IPC_CHANNELS.IDENTITY_SETUP, setupCompanyInputSchema, (input) => setupCompany(input))

  handle(IPC_CHANNELS.IDENTITY_LOGIN, loginInputSchema, (input) => login(input))

  handle(IPC_CHANNELS.IDENTITY_SESSION, (): SessionContext | null => getSession())

  handle(IPC_CHANNELS.IDENTITY_STATUS, () => getAuthStatus())

  handle(IPC_CHANNELS.IDENTITY_CREATE_STAFF, createStaffMemberInputSchema, (input) =>
    createStaffMember(input)
  )

  handle(IPC_CHANNELS.IDENTITY_CHECK_COMPANY_EXISTS, companyExistenceInputSchema, (input) =>
    checkCompanyExists(input)
  )

  handle(IPC_CHANNELS.IDENTITY_UPDATE_COMPANY, updateCompanyInputSchema, (input) =>
    updateCompany(input)
  )
  handle(IPC_CHANNELS.IDENTITY_LOGOUT, () => {
    logout()
    return true
  })
}
