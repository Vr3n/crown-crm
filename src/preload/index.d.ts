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
import type { NumberingRow, UpdateNumberingInput } from '../shared/contracts/numbering'
import type { ItemSummary, PartySummary, VoucherSummary } from '../shared/contracts/summaries'
import type { VoucherType } from '../shared/contracts/vouchers'
import type { LicenseStatus } from '../shared/contracts/license'
import type { RoleOutput, StaffMemberOutput } from '../shared/contracts/identity-read'
import type {
  AccountRow,
  CreateAccountInput,
  CreateItemInput,
  CreatePartyInput,
  CreateUnitInput,
  ItemRow,
  PartyListInput,
  PartyRow,
  UpdateItemInput,
  UpdatePartyInput
} from '../shared/contracts/masters'
import type {
  ListVouchersInput,
  OutstandingBill,
  OutstandingInput,
  PostVoucherInput,
  VoucherDetail,
  VoucherListRow
} from '../shared/contracts/vouchers'
import type {
  AgeingRow,
  BalanceSheetReport,
  ProfitLossReport,
  ReceivableRow,
  RegisterRow,
  StatementRow,
  StockRow,
  TrialBalanceRow
} from '../shared/contracts/reports'

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
      parties: {
        list: (input: PartyListInput) => Promise<PartyRow[]>
        get: (id: number) => Promise<PartyRow>
        create: (input: CreatePartyInput) => Promise<PartyRow>
        update: (input: UpdatePartyInput) => Promise<PartyRow>
        deactivate: (id: number) => Promise<void>
      }
      items: {
        list: (query?: string, includeInactive?: boolean) => Promise<ItemRow[]>
        get: (id: number) => Promise<ItemRow>
        create: (input: CreateItemInput) => Promise<ItemRow>
        update: (input: UpdateItemInput) => Promise<ItemRow>
        deactivate: (id: number) => Promise<void>
      }
      accounts: {
        list: (includeInactive?: boolean) => Promise<AccountRow[]>
        groups: () => Promise<{ id: number; name: string; nature: string }[]>
        create: (input: CreateAccountInput) => Promise<AccountRow>
        deactivate: (id: number) => Promise<void>
      }
      units: {
        list: () => Promise<{ id: number; name: string; symbol: string }[]>
        create: (input: CreateUnitInput) => Promise<void>
      }
      godowns: {
        list: () => Promise<{ id: number; name: string }[]>
      }
      vouchers: {
        post: (input: PostVoucherInput) => Promise<{ id: number; number: string }>
        get: (id: number) => Promise<VoucherDetail>
        list: (input: ListVouchersInput) => Promise<VoucherListRow[]>
        cancel: (id: number, reason: string) => Promise<void>
        outstanding: (input: OutstandingInput) => Promise<OutstandingBill[]>
        postOpening: (date: string) => Promise<{ id: number; number: string }>
      }
      dashboard: {
        summary: () => Promise<DashboardSummary>
      }
      summaries: {
        parties: () => Promise<PartySummary>
        items: () => Promise<ItemSummary>
        vouchers: (input: {
          type?: VoucherType
          from: string
          to: string
        }) => Promise<VoucherSummary>
      }
      numbering: {
        list: () => Promise<NumberingRow[]>
        update: (input: UpdateNumberingInput) => Promise<NumberingRow[]>
        completeOnboarding: () => Promise<{ onboardingCompletedAt: string | null }>
      }
      reports: {
        trialBalance: () => Promise<TrialBalanceRow[]>
        profitLoss: (from: string, to: string) => Promise<ProfitLossReport>
        balanceSheet: (from: string, to: string) => Promise<BalanceSheetReport>
        receivables: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE') => Promise<ReceivableRow[]>
        payables: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE') => Promise<ReceivableRow[]>
        ageing: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE') => Promise<AgeingRow[]>
        statement: (partyId: number, from: string, to: string) => Promise<StatementRow[]>
        register: (type: 'SALES' | 'PURCHASE', from: string, to: string) => Promise<RegisterRow[]>
        stock: () => Promise<StockRow[]>
      }
      license: {
        status: () => Promise<LicenseStatus>
      }
      backup: {
        create: () => Promise<{ name: string; sizeBytes: number; createdAt: string }>
        list: () => Promise<{ name: string; sizeBytes: number; createdAt: string }[]>
      }
      exportPdf: (filename: string) => Promise<{ saved: boolean; filePath?: string }>
    }
  }
}
