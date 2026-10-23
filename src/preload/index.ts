import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/contracts/ipc.channels'
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
import type { IpcResult } from '../shared/contracts/errors'
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

  parties: {
    list: (input: PartyListInput): Promise<PartyRow[]> => call(IPC_CHANNELS.PARTIES_LIST, input),
    get: (id: number): Promise<PartyRow> => call(IPC_CHANNELS.PARTIES_GET, { id }),
    create: (input: CreatePartyInput): Promise<PartyRow> =>
      call(IPC_CHANNELS.PARTIES_CREATE, input),
    update: (input: UpdatePartyInput): Promise<PartyRow> =>
      call(IPC_CHANNELS.PARTIES_UPDATE, input),
    deactivate: (id: number): Promise<void> => call(IPC_CHANNELS.PARTIES_DEACTIVATE, { id })
  },

  items: {
    list: (query?: string, includeInactive = false): Promise<ItemRow[]> =>
      call(IPC_CHANNELS.ITEMS_LIST, { query, includeInactive }),
    get: (id: number): Promise<ItemRow> => call(IPC_CHANNELS.ITEMS_GET, { id }),
    create: (input: CreateItemInput): Promise<ItemRow> => call(IPC_CHANNELS.ITEMS_CREATE, input),
    update: (input: UpdateItemInput): Promise<ItemRow> => call(IPC_CHANNELS.ITEMS_UPDATE, input),
    deactivate: (id: number): Promise<void> => call(IPC_CHANNELS.ITEMS_DEACTIVATE, { id })
  },

  accounts: {
    list: (includeInactive = false): Promise<AccountRow[]> =>
      call(IPC_CHANNELS.ACCOUNTS_LIST, { includeInactive }),
    groups: (): Promise<{ id: number; name: string; nature: string }[]> =>
      call(IPC_CHANNELS.ACCOUNTS_GROUPS),
    create: (input: CreateAccountInput): Promise<AccountRow> =>
      call(IPC_CHANNELS.ACCOUNTS_CREATE, input),
    deactivate: (id: number): Promise<void> => call(IPC_CHANNELS.ACCOUNTS_DEACTIVATE, { id })
  },

  units: {
    list: (): Promise<{ id: number; name: string; symbol: string }[]> =>
      call(IPC_CHANNELS.UNITS_LIST),
    create: (input: CreateUnitInput): Promise<void> => call(IPC_CHANNELS.UNITS_CREATE, input)
  },

  godowns: {
    list: (): Promise<{ id: number; name: string }[]> => call(IPC_CHANNELS.GODOWNS_LIST)
  },

  vouchers: {
    post: (input: PostVoucherInput): Promise<{ id: number; number: string }> =>
      call(IPC_CHANNELS.VOUCHERS_POST, input),
    get: (id: number): Promise<VoucherDetail> => call(IPC_CHANNELS.VOUCHERS_GET, { id }),
    list: (input: ListVouchersInput): Promise<VoucherListRow[]> =>
      call(IPC_CHANNELS.VOUCHERS_LIST, input),
    cancel: (id: number, reason: string): Promise<void> =>
      call(IPC_CHANNELS.VOUCHERS_CANCEL, { id, reason }),
    outstanding: (input: OutstandingInput): Promise<OutstandingBill[]> =>
      call(IPC_CHANNELS.VOUCHERS_OUTSTANDING, input),
    postOpening: (date: string): Promise<{ id: number; number: string }> =>
      call(IPC_CHANNELS.VOUCHERS_POST_OPENING, { date })
  },

  dashboard: {
    summary: (): Promise<DashboardSummary> => call(IPC_CHANNELS.DASHBOARD_SUMMARY)
  },

  summaries: {
    parties: (): Promise<PartySummary> => call(IPC_CHANNELS.PARTIES_SUMMARY),
    items: (): Promise<ItemSummary> => call(IPC_CHANNELS.ITEMS_SUMMARY),
    vouchers: (input: { type?: VoucherType; from: string; to: string }): Promise<VoucherSummary> =>
      call(IPC_CHANNELS.VOUCHERS_SUMMARY, input)
  },

  numbering: {
    list: (): Promise<NumberingRow[]> => call(IPC_CHANNELS.NUMBERING_LIST),
    update: (input: UpdateNumberingInput): Promise<NumberingRow[]> =>
      call(IPC_CHANNELS.NUMBERING_UPDATE, input),
    completeOnboarding: (): Promise<{ onboardingCompletedAt: string | null }> =>
      call(IPC_CHANNELS.ONBOARDING_COMPLETE)
  },

  reports: {
    trialBalance: (): Promise<TrialBalanceRow[]> => call(IPC_CHANNELS.REPORTS_TRIAL_BALANCE),
    profitLoss: (from: string, to: string): Promise<ProfitLossReport> =>
      call(IPC_CHANNELS.REPORTS_PROFIT_LOSS, { from, to }),
    balanceSheet: (from: string, to: string): Promise<BalanceSheetReport> =>
      call(IPC_CHANNELS.REPORTS_BALANCE_SHEET, { from, to }),
    receivables: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE'): Promise<ReceivableRow[]> =>
      call(IPC_CHANNELS.REPORTS_RECEIVABLES, { asOf, basis }),
    payables: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE'): Promise<ReceivableRow[]> =>
      call(IPC_CHANNELS.REPORTS_PAYABLES, { asOf, basis }),
    ageing: (asOf: string, basis: 'BILL_DATE' | 'DUE_DATE'): Promise<AgeingRow[]> =>
      call(IPC_CHANNELS.REPORTS_AGEING, { asOf, basis }),
    statement: (partyId: number, from: string, to: string): Promise<StatementRow[]> =>
      call(IPC_CHANNELS.REPORTS_STATEMENT, { partyId, from, to }),
    register: (type: 'SALES' | 'PURCHASE', from: string, to: string): Promise<RegisterRow[]> =>
      call(IPC_CHANNELS.REPORTS_REGISTER, { type, from, to }),
    stock: (): Promise<StockRow[]> => call(IPC_CHANNELS.REPORTS_STOCK),
    stockMovements: (itemId: number, from: string, to: string): Promise<StockMovementRow[]> =>
      call(IPC_CHANNELS.REPORTS_STOCK_MOVEMENTS, { itemId, from, to })
  },
  license: {
    status: (): Promise<LicenseStatus> => call(IPC_CHANNELS.LICENSE_STATUS)
  },

  backup: {
    create: (): Promise<{ name: string; sizeBytes: number; createdAt: string }> =>
      call(IPC_CHANNELS.BACKUP_CREATE),
    list: (): Promise<{ name: string; sizeBytes: number; createdAt: string }[]> =>
      call(IPC_CHANNELS.BACKUP_LIST)
  },

  exportPdf: (filename: string): Promise<{ saved: boolean; filePath?: string }> =>
    call(IPC_CHANNELS.EXPORT_PDF, { filename })
}

export type Api = typeof api

export { api }

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('Failed to expose the preload API', error)
}
