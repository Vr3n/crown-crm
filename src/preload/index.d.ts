import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AuthStatus,
  CompanyExistenceInput,
  CompanyProfile,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  SessionContext,
  SetupCompanyInput,
  UpdateCompanyInput
} from '../shared/contracts/identity'
import type { DashboardSummary } from '../shared/contracts/dashboard'
import type { LicenseStatus } from '../shared/contracts/license'
import type { RoleOutput, StaffMemberOutput } from '../shared/contracts/identity-read'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      identity: {
        status: () => Promise<AuthStatus>
        setup: (input: SetupCompanyInput) => Promise<SessionContext>
        login: (input: LoginInput) => Promise<SessionContext>
        session: () => Promise<SessionContext | null>
        logout: () => Promise<void>
        createStaff: (input: CreateStaffMemberInput) => Promise<CreatedStaffMember>
        checkCompanyExists: (input: CompanyExistenceInput) => Promise<boolean>
        company: () => Promise<CompanyProfile | null>
        updateCompany: (input: UpdateCompanyInput) => Promise<CompanyProfile>
        staff: () => Promise<StaffMemberOutput[]>
        roles: () => Promise<RoleOutput[]>
      }
      dashboard: {
        summary: () => Promise<DashboardSummary>
      }
      license: {
        status: () => Promise<LicenseStatus>
      }
    }
  }
}
