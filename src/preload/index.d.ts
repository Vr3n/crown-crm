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
import type { ExportCsvInput, ExportResult, ExportTableInput } from '../shared/contracts/export'
import type { InvoiceDocument } from '../shared/contracts/invoice'
import type { BackupDestinations, BackupFile, BackupPathInput } from '../shared/contracts/backup'
import type { SearchInput, SearchOutput } from '../shared/contracts/search'
import type {
  CreateRoleInput,
  PermissionOutput,
  ResetStaffPasswordInput,
  RoleOutput,
  StaffMemberOutput,
  UpdateRoleInput,
  UpdateStaffInput
} from '../shared/contracts/access'
import type {
  AccountRow,
  CreateAccountInput,
  CreateItemInput,
  CreatePartyInput,
  CreateTaxRateInput,
  CreateUnitInput,
  ItemRow,
  PartyListInput,
  PartyRow,
  RetireTaxRateInput,
  ReviseTaxRateInput,
  TaxRateListInput,
  TaxRateRow,
  UnitListInput,
  UnitRow,
  UpdateItemInput,
  UpdatePartyInput,
  UpdateUnitInput
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
  StockMovementRow,
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
        permissions: () => Promise<PermissionOutput[]>
        updateStaff: (input: UpdateStaffInput) => Promise<StaffMemberOutput>
        resetStaffPassword: (input: ResetStaffPasswordInput) => Promise<void>
        createRole: (input: CreateRoleInput) => Promise<RoleOutput>
        updateRole: (input: UpdateRoleInput) => Promise<RoleOutput>
        deleteRole: (id: number) => Promise<boolean>
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
        list: (input: UnitListInput) => Promise<UnitRow[]>
        create: (input: CreateUnitInput) => Promise<UnitRow>
        update: (input: UpdateUnitInput) => Promise<UnitRow>
        deactivate: (id: number) => Promise<UnitRow>
      }
      taxRates: {
        list: (input: TaxRateListInput) => Promise<TaxRateRow[]>
        create: (input: CreateTaxRateInput) => Promise<TaxRateRow>
        revise: (input: ReviseTaxRateInput) => Promise<TaxRateRow>
        retire: (input: RetireTaxRateInput) => Promise<TaxRateRow>
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
      invoice: {
        document: (id: number) => Promise<InvoiceDocument>
        exportPdf: (id: number) => Promise<ExportResult>
      }
      dashboard: {
        summary: () => Promise<DashboardSummary>
      }
      search: {
        query: (input: SearchInput) => Promise<SearchOutput>
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
        stockMovements: (itemId: number, from: string, to: string) => Promise<StockMovementRow[]>
      }
      license: {
        status: () => Promise<LicenseStatus>
      }
      backup: {
        create: () => Promise<BackupFile>
        list: () => Promise<BackupFile[]>
        destinations: () => Promise<BackupDestinations>
        addDestination: () => Promise<BackupDestinations | null>
        removeDestination: (input: BackupPathInput) => Promise<BackupDestinations>
        revealFolder: (input: BackupPathInput) => Promise<void>
      }
      exportPdf: (filename: string) => Promise<{ saved: boolean; filePath?: string }>
      exportXlsx: (input: ExportTableInput) => Promise<ExportResult>
      exportCsv: (input: ExportCsvInput) => Promise<ExportResult>
    }
  }
}
