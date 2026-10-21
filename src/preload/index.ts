import { ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/contracts/ipc.channels'
import type {
  AuthStatus,
  CompanyExistenceInput,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  SessionContext,
  SetupCompanyInput,
  UpdateCompanyInput,
  CompanyProfile
} from '../shared/contracts/identity'
import type { IpcResult } from '../shared/contracts/errors'
import type { DashboardSummary } from '../shared/contracts/dashboard'
import type { LicenseStatus } from '../shared/contracts/license'
import type { RoleOutput, StaffMemberOutput } from '../shared/contracts/identity-read'

/**
 * Unwraps the main process envelope. A failure is re-thrown as an Error with a
 * stable `code` so the renderer branches on the code, never on the message.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (result.ok) return result.data
  const error = new Error(result.error.message) as Error & { code?: string }
  error.code = result.error.code
  throw error
}

const api = {
  identity: {
    status: (): Promise<AuthStatus> => call(IPC_CHANNELS.IDENTITY_STATUS),
    setup: (input: SetupCompanyInput): Promise<SessionContext> =>
      call(IPC_CHANNELS.IDENTITY_SETUP, input),
    login: (input: LoginInput): Promise<SessionContext> => call(IPC_CHANNELS.IDENTITY_LOGIN, input),
    session: (): Promise<SessionContext | null> => call(IPC_CHANNELS.IDENTITY_SESSION),
    logout: (): Promise<void> => call(IPC_CHANNELS.IDENTITY_LOGOUT),
    createStaff: (input: CreateStaffMemberInput): Promise<CreatedStaffMember> =>
      call(IPC_CHANNELS.IDENTITY_CREATE_STAFF, input),
    checkCompanyExists: (input: CompanyExistenceInput): Promise<boolean> =>
      call(IPC_CHANNELS.IDENTITY_CHECK_COMPANY_EXISTS, input),
    company: (): Promise<CompanyProfile | null> => call(IPC_CHANNELS.IDENTITY_COMPANY),
    updateCompany: (input: UpdateCompanyInput): Promise<CompanyProfile> =>
      call(IPC_CHANNELS.IDENTITY_UPDATE_COMPANY, input),
    staff: (): Promise<StaffMemberOutput[]> => call(IPC_CHANNELS.IDENTITY_STAFF),
    roles: (): Promise<RoleOutput[]> => call(IPC_CHANNELS.IDENTITY_ROLES)
  },
  dashboard: {
    summary: (): Promise<DashboardSummary> => call(IPC_CHANNELS.DASHBOARD_SUMMARY)
  },
  license: {
    status: (): Promise<LicenseStatus> => call(IPC_CHANNELS.LICENSE_STATUS)
  }
}

export type Api = typeof api

export { api }
