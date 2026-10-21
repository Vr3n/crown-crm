import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ApiError } from '../shared/contracts/errors'
import type { IpcResult } from '../shared/contracts/errors'
import type {
  AuthStatus,
  CreateStaffMemberInput,
  CreatedStaffMember,
  LoginInput,
  OrganizationExistenceInput,
  SessionContext,
  SetupOrganizationInput,
  UpdateOrganizationInput
} from '../shared/contracts/identity'
import type {
  CreateCancellationPolicyInput,
  CreateFreezePolicyInput,
  CreateOfferInput,
  CreatePlanInput,
  CreateProrationPolicyInput,
  OfferIdRequest,
  OfferRow,
  OfferVersionListRequest,
  OfferVersionRow,
  PlanIdRequest,
  PlanRow,
  PlanVersionListRequest,
  PlanVersionRow,
  PolicyLookupSet,
  UpdateCancellationPolicyInput,
  UpdateFreezePolicyInput,
  UpdateOfferInput,
  UpdatePlanInput,
  UpdateProrationPolicyInput
} from '../shared/contracts/catalog'
import type {
  CreateInvoiceInput,
  AddInvoiceLineInput,
  RemoveInvoiceLineInput,
  FinalizeInvoiceInput,
  VoidInvoiceInput,
  MarkUncollectibleInput,
  UpdateBillingSnapshotInput,
  InvoiceIdRequest,
  CustomerInvoicesRequest,
  InvoiceDetail,
  InvoiceNumberPreview,
  InvoiceNumberPreviewRequest,
  InvoiceLineRow,
  InvoiceRow
} from '../shared/contracts/billing'
import type {
  RecordPaymentInput,
  AllocatePaymentInput,
  RecordAndAllocatePaymentInput,
  IssueRefundInput,
  IssueCreditInput,
  ApplyCreditInput,
  InvoicePaymentStateRequest,
  PaymentIdRequest,
  CustomerPaymentsRequest,
  CustomerCreditBalanceRequest,
  OutstandingInvoicesRequest,
  OutstandingInvoiceRow,
  PaymentRow,
  InvoicePaymentState,
  RefundRow,
  CreditRow,
  PaymentMethodRow
} from '../shared/contracts/finance'
import type { CustomerIdRequest, CustomerRowOutput } from '../shared/contracts/customers'
import type { SellMembershipInput, SellMembershipResult } from '../shared/contracts/membership-sale'
import type {
  CancelMembershipInput,
  CancelMembershipResult,
  RevertCancellationInput,
  RenewMembershipInput,
  RenewMembershipResult,
  MembershipRefundStateRequest,
  MembershipRefundState
} from '../shared/contracts/membership-cancel-renew'
import type {
  InvoiceIdRequest as InvoiceReadIdRequest,
  InvoicesByStatusRequest,
  InvoiceOutput
} from '../shared/contracts/invoices'
import type {
  MemberRecordRequest,
  MembershipExpirationOutput,
  PaymentDueOutput,
  MemberRecordOutput
} from '../shared/contracts/dashboard'
import type { PaymentRecordOutput } from '../shared/contracts/collections'
import type {
  OrganizationOutput,
  StaffMemberOutput,
  RoleOutput
} from '../shared/contracts/identity-read'
import type { LicenseStatus } from '../shared/contracts/license'
import type {
  AssignLeadInput,
  BulkMoveLeadStageInput,
  BulkMoveLeadStageResult,
  BulkRecordActivityInput,
  BulkRecordActivityResult,
  BulkCompleteFollowUpsInput,
  BulkCompleteFollowUpsResult,
  BulkScheduleFollowUpInput,
  BulkScheduleFollowUpResult,
  CancelFollowUpInput,
  CheckLeadPersonInput,
  CompleteFollowUpInput,
  CreateLeadInput,
  CreateLeadSourceInput,
  CreatedLead,
  DeleteLeadsInput,
  EditLeadInput,
  FunnelCounts,
  LeadDetails,
  LeadIdRequest,
  LeadListRequest,
  LeadListResponse,
  LeadPersonAvailability,
  LeadSourceRow,
  LeadTextOptionRow,
  LeadTimelineEntry,
  MarkLeadLostInput,
  MoveLeadStageInput,
  PeopleList,
  PlanOptionRow,
  RecordLeadActivityInput,
  ReferenceData,
  ScheduleFollowUpInput,
  UpdateFollowUpInput
} from '../shared/contracts/sales'
import type {
  UpdatePersonPhotoInput,
  DeletePersonPhotoInput,
  GetPersonPhotoInput,
  PersonPhotoOutput,
  GetManyPersonPhotosInput,
  GetManyPersonPhotosOutput
} from '../shared/contracts/person-photo'
import type {
  UpdateOrgLogoInput,
  OrgLogoOutput
} from '../shared/contracts/organization-logo'
import { IPC_CHANNELS } from '../shared/contracts/ipc.channels'

/* -------------------------------------------------------------------------- */
/* Export types (mirrors src/main/application/export.ts)                       */
/* -------------------------------------------------------------------------- */

type CellFormat = 'text' | 'money' | 'date' | 'datetime' | 'number' | 'isodate'

interface ExportColumn {
  header: string
  key: string
  width?: number
  format?: CellFormat
}

interface ExportTableInput {
  sheetName: string
  filename: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
  currency?: string
  timezone?: string
}

/**
 * Invokes an IPC channel and unwraps the `{ ok, data | error }` envelope.
 * On failure it re-throws an `ApiError` carrying the stable machine-readable
 * code from the shared catalog, so the renderer branches on `error.code`
 * (ADR-0006) instead of matching on messages or Electron's serialization.
 *
 * Note: Electron's contextBridge clones the thrown `ApiError` into a plain
 * `Error` in the renderer realm — `instanceof ApiError` fails and `code` is
 * dropped, but `message` survives. Renderer surfaces therefore display
 * `error.message` (not the code) when it is an `Error`.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (res && typeof res === 'object' && 'ok' in res) {
    if (res.ok) return res.data
    const { code, message, details } = res.error
    throw new ApiError(code, message, details)
  }
  return res
}

// Custom APIs for renderer
const api = {
  identity: {
    setup: (input: SetupOrganizationInput): Promise<SessionContext> =>
      call(IPC_CHANNELS.IDENTITY_SETUP, input),
    login: (input: LoginInput): Promise<SessionContext> => call(IPC_CHANNELS.IDENTITY_LOGIN, input),
    session: (): Promise<SessionContext | null> => call(IPC_CHANNELS.IDENTITY_SESSION),
    status: (): Promise<AuthStatus> => call(IPC_CHANNELS.IDENTITY_STATUS),
    createStaff: (input: CreateStaffMemberInput): Promise<CreatedStaffMember> =>
      call(IPC_CHANNELS.IDENTITY_CREATE_STAFF, input),
    checkOrganizationExists: (input: OrganizationExistenceInput): Promise<boolean> =>
      call(IPC_CHANNELS.IDENTITY_CHECK_ORGANIZATION_EXISTS, input),
    updateOrganization: (input: UpdateOrganizationInput): Promise<OrganizationOutput> =>
      call(IPC_CHANNELS.IDENTITY_UPDATE_ORGANIZATION, input),
    logout: (): Promise<boolean> => call(IPC_CHANNELS.IDENTITY_LOGOUT)
  },
  leads: {
    create: (input: CreateLeadInput): Promise<CreatedLead> =>
      call(IPC_CHANNELS.LEADS_CREATE, input),
    editLead: (input: EditLeadInput): Promise<void> => call(IPC_CHANNELS.LEADS_EDIT, input),
    moveStage: (input: MoveLeadStageInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_MOVE_STAGE, input),
    deleteLeads: (input: DeleteLeadsInput): Promise<void> => call(IPC_CHANNELS.LEADS_DELETE, input),
    bulkMoveStage: (input: BulkMoveLeadStageInput): Promise<BulkMoveLeadStageResult> =>
      call(IPC_CHANNELS.LEADS_BULK_MOVE_STAGE, input),
    bulkScheduleFollowup: (input: BulkScheduleFollowUpInput): Promise<BulkScheduleFollowUpResult> =>
      call(IPC_CHANNELS.LEADS_BULK_SCHEDULE_FOLLOWUP, input),
    bulkRecordActivity: (input: BulkRecordActivityInput): Promise<BulkRecordActivityResult> =>
      call(IPC_CHANNELS.LEADS_BULK_RECORD_ACTIVITY, input),
    recordActivity: (input: RecordLeadActivityInput): Promise<{ activityId: number }> =>
      call(IPC_CHANNELS.LEADS_RECORD_ACTIVITY, input),
    assign: (input: AssignLeadInput): Promise<void> => call(IPC_CHANNELS.LEADS_ASSIGN, input),
    markLost: (input: MarkLeadLostInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_MARK_LOST, input),
    scheduleFollowup: (input: ScheduleFollowUpInput): Promise<{ followupId: number }> =>
      call(IPC_CHANNELS.LEADS_SCHEDULE_FOLLOWUP, input),
    completeFollowup: (input: CompleteFollowUpInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_COMPLETE_FOLLOWUP, input),
    bulkCompleteFollowups: (
      input: BulkCompleteFollowUpsInput
    ): Promise<BulkCompleteFollowUpsResult> =>
      call(IPC_CHANNELS.LEADS_BULK_COMPLETE_FOLLOWUPS, input),
    updateFollowup: (input: UpdateFollowUpInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_UPDATE_FOLLOWUP, input),
    cancelFollowup: (input: CancelFollowUpInput): Promise<void> =>
      call(IPC_CHANNELS.LEADS_CANCEL_FOLLOWUP, input),
    getDetails: (input: LeadIdRequest): Promise<LeadDetails | null> =>
      call(IPC_CHANNELS.LEADS_GET_DETAILS, input),
    list: (input: LeadListRequest): Promise<LeadListResponse> =>
      call(IPC_CHANNELS.LEADS_LIST, input),
    getTimeline: (input: LeadIdRequest): Promise<LeadTimelineEntry[]> =>
      call(IPC_CHANNELS.LEADS_GET_TIMELINE, input),
    getNew: (): Promise<{ id: number; personName: string; phone: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_NEW),
    getUncontacted: (): Promise<{ id: number; personName: string; phone: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_UNCONTACTED),
    getTodaysFollowups: (): Promise<
      { followupId: number; leadId: number; title: string; dueAt: string }[]
    > => call(IPC_CHANNELS.LEADS_GET_TODAYS_FOLLOWUPS),
    getOverdueFollowups: (): Promise<
      { followupId: number; leadId: number; title: string; dueAt: string }[]
    > => call(IPC_CHANNELS.LEADS_GET_OVERDUE_FOLLOWUPS),
    getTrialsEnding: (): Promise<{ id: number; personName: string; dueAt: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_TRIALS_ENDING),
    getRecentlyWon: (): Promise<{ id: number; personName: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_RECENT_WON),
    getRecentlyLost: (): Promise<{ id: number; personName: string }[]> =>
      call(IPC_CHANNELS.LEADS_GET_RECENT_LOST),
    getFunnelCounts: (): Promise<FunnelCounts> => call(IPC_CHANNELS.LEADS_GET_FUNNEL_COUNTS),
    searchPeople: (query: string): Promise<PeopleList> =>
      call(IPC_CHANNELS.LEADS_SEARCH_PEOPLE, query),
    checkPerson: (input: CheckLeadPersonInput): Promise<LeadPersonAvailability> =>
      call(IPC_CHANNELS.LEADS_CHECK_PERSON, input),
    getReferenceData: (): Promise<ReferenceData> => call(IPC_CHANNELS.LEADS_GET_REFERENCE),
    searchSources: (query: string): Promise<LeadSourceRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_SOURCES, { query }),
    createSource: (input: CreateLeadSourceInput): Promise<LeadSourceRow> =>
      call(IPC_CHANNELS.LEADS_CREATE_SOURCE, input),
    searchPlanInterests: (query: string): Promise<PlanOptionRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_PLAN_INTERESTS, { query }),
    searchGoals: (query: string): Promise<LeadTextOptionRow[]> =>
      call(IPC_CHANNELS.LEADS_SEARCH_GOALS, { query })
  },
  catalog: {
    listPlans: (): Promise<PlanRow[]> => call(IPC_CHANNELS.CATALOG_LIST_PLANS),
    listAvailablePlans: (): Promise<PlanRow[]> => call(IPC_CHANNELS.CATALOG_LIST_AVAILABLE_PLANS),
    createPlan: (input: CreatePlanInput): Promise<PlanRow> =>
      call(IPC_CHANNELS.CATALOG_CREATE_PLAN, input),
    updatePlan: (input: UpdatePlanInput): Promise<PlanRow> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_PLAN, input),
    deletePlan: (input: PlanIdRequest): Promise<void> =>
      call(IPC_CHANNELS.CATALOG_DELETE_PLAN, input),

    listOffers: (): Promise<OfferRow[]> => call(IPC_CHANNELS.CATALOG_LIST_OFFERS),
    getOffer: (input: OfferIdRequest): Promise<OfferRow> =>
      call(IPC_CHANNELS.CATALOG_GET_OFFER, input),
    createOffer: (input: CreateOfferInput): Promise<OfferRow> =>
      call(IPC_CHANNELS.CATALOG_CREATE_OFFER, input),
    updateOffer: (input: UpdateOfferInput): Promise<OfferRow> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_OFFER, input),
    deactivateOffer: (input: OfferIdRequest): Promise<void> =>
      call(IPC_CHANNELS.CATALOG_DEACTIVATE_OFFER, input),

    listOfferVersions: (input: OfferVersionListRequest): Promise<OfferVersionRow[]> =>
      call(IPC_CHANNELS.CATALOG_LIST_OFFER_VERSIONS, input),

    listPlanVersions: (input: PlanVersionListRequest): Promise<PlanVersionRow[]> =>
      call(IPC_CHANNELS.CATALOG_LIST_PLAN_VERSIONS, input),
    listPolicyLookups: (): Promise<PolicyLookupSet> =>
      call(IPC_CHANNELS.CATALOG_LIST_POLICY_LOOKUPS),
    createFreezePolicy: (
      input: CreateFreezePolicyInput
    ): Promise<PolicyLookupSet['freezePolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_CREATE_FREEZE_POLICY, input),
    updateFreezePolicy: (
      input: UpdateFreezePolicyInput
    ): Promise<PolicyLookupSet['freezePolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_FREEZE_POLICY, input),
    createProrationPolicy: (
      input: CreateProrationPolicyInput
    ): Promise<PolicyLookupSet['prorationPolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_CREATE_PRORATION_POLICY, input),
    updateProrationPolicy: (
      input: UpdateProrationPolicyInput
    ): Promise<PolicyLookupSet['prorationPolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_PRORATION_POLICY, input),
    createCancellationPolicy: (
      input: CreateCancellationPolicyInput
    ): Promise<PolicyLookupSet['cancellationPolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_CREATE_CANCELLATION_POLICY, input),
    updateCancellationPolicy: (
      input: UpdateCancellationPolicyInput
    ): Promise<PolicyLookupSet['cancellationPolicies'][number]> =>
      call(IPC_CHANNELS.CATALOG_UPDATE_CANCELLATION_POLICY, input)
  },
  billing: {
    createInvoice: (input: CreateInvoiceInput): Promise<InvoiceRow> =>
      call(IPC_CHANNELS.BILLING_CREATE_INVOICE, input),
    addLine: (input: AddInvoiceLineInput): Promise<InvoiceLineRow> =>
      call(IPC_CHANNELS.BILLING_ADD_LINE, input),
    removeLine: (input: RemoveInvoiceLineInput): Promise<void> =>
      call(IPC_CHANNELS.BILLING_REMOVE_LINE, input),
    finalize: (input: FinalizeInvoiceInput): Promise<InvoiceRow> =>
      call(IPC_CHANNELS.BILLING_FINALIZE, input),
    void: (input: VoidInvoiceInput): Promise<InvoiceRow> => call(IPC_CHANNELS.BILLING_VOID, input),
    markUncollectible: (input: MarkUncollectibleInput): Promise<InvoiceRow> =>
      call(IPC_CHANNELS.BILLING_MARK_UNCOLLECTIBLE, input),
    getInvoice: (input: InvoiceIdRequest): Promise<InvoiceDetail> =>
      call(IPC_CHANNELS.BILLING_GET_INVOICE, input),
    updateSnapshot: (input: UpdateBillingSnapshotInput): Promise<InvoiceRow> =>
      call(IPC_CHANNELS.BILLING_UPDATE_SNAPSHOT, input),
    nextNumber: (input?: InvoiceNumberPreviewRequest): Promise<InvoiceNumberPreview> =>
      call(IPC_CHANNELS.BILLING_NEXT_NUMBER, input),
    listByCustomer: (input: CustomerInvoicesRequest): Promise<InvoiceRow[]> =>
      call(IPC_CHANNELS.BILLING_LIST_BY_CUSTOMER, input),
    listOpen: (): Promise<InvoiceRow[]> => call(IPC_CHANNELS.BILLING_LIST_OPEN)
  },
  finance: {
    recordPayment: (input: RecordPaymentInput): Promise<PaymentRow> =>
      call(IPC_CHANNELS.FINANCE_RECORD_PAYMENT, input),
    allocatePayment: (input: AllocatePaymentInput): Promise<{ allocationId: number }> =>
      call(IPC_CHANNELS.FINANCE_ALLOCATE_PAYMENT, input),
    recordAndAllocate: (
      input: RecordAndAllocatePaymentInput
    ): Promise<{ paymentId: number; allocationId: number }> =>
      call(IPC_CHANNELS.FINANCE_RECORD_AND_ALLOCATE, input),
    issueRefund: (input: IssueRefundInput): Promise<RefundRow> =>
      call(IPC_CHANNELS.FINANCE_ISSUE_REFUND, input),
    issueCredit: (input: IssueCreditInput): Promise<CreditRow> =>
      call(IPC_CHANNELS.FINANCE_ISSUE_CREDIT, input),
    applyCredit: (input: ApplyCreditInput): Promise<{ creditAllocationId: number }> =>
      call(IPC_CHANNELS.FINANCE_APPLY_CREDIT, input),
    getInvoicePaymentState: (input: InvoicePaymentStateRequest): Promise<InvoicePaymentState> =>
      call(IPC_CHANNELS.FINANCE_GET_INVOICE_STATE, input),
    paymentHistory: (input: CustomerPaymentsRequest): Promise<PaymentRow[]> =>
      call(IPC_CHANNELS.FINANCE_PAYMENT_HISTORY, input),
    refundHistory: (input: PaymentIdRequest): Promise<RefundRow[]> =>
      call(IPC_CHANNELS.FINANCE_REFUND_HISTORY, input),
    creditBalance: (input: CustomerCreditBalanceRequest): Promise<{ balanceMinor: number }> =>
      call(IPC_CHANNELS.FINANCE_CREDIT_BALANCE, input),
    listCredits: (input: CustomerCreditBalanceRequest): Promise<CreditRow[]> =>
      call(IPC_CHANNELS.FINANCE_LIST_CREDITS, input),
    listPaymentMethods: (): Promise<PaymentMethodRow[]> =>
      call(IPC_CHANNELS.FINANCE_LIST_PAYMENT_METHODS),
    outstandingInvoicesFor: (input: OutstandingInvoicesRequest): Promise<OutstandingInvoiceRow[]> =>
      call(IPC_CHANNELS.FINANCE_OUTSTANDING_INVOICES, input),
    listPayments: (): Promise<unknown[]> => call(IPC_CHANNELS.FINANCE_LIST_PAYMENTS, {}),
    listRefunds: (): Promise<unknown[]> => call(IPC_CHANNELS.FINANCE_LIST_REFUNDS, {}),
    listAllCredits: (): Promise<unknown[]> => call(IPC_CHANNELS.FINANCE_LIST_ALL_CREDITS, {}),
    processScheduledRefunds: (): Promise<{ issued: number }> =>
      call(IPC_CHANNELS.FINANCE_PROCESS_SCHEDULED_REFUNDS, {})
  },
  pdf: {
    exportInvoice: (input: { invoiceId: number; mode?: 'save' | 'preview' }): Promise<string> =>
      call(IPC_CHANNELS.PDF_EXPORT_INVOICE, input),
    exportReceipt: (input: { paymentId: number; mode?: 'save' | 'preview' }): Promise<string> =>
      call(IPC_CHANNELS.PDF_EXPORT_RECEIPT, input),
    exportRefund: (input: { refundId: number; mode?: 'save' | 'preview' }): Promise<string> =>
      call(IPC_CHANNELS.PDF_EXPORT_REFUND, input)
  },
  customers: {
    list: (): Promise<CustomerRowOutput[]> => call(IPC_CHANNELS.CUSTOMERS_LIST),
    get: (input: CustomerIdRequest): Promise<CustomerRowOutput | undefined> =>
      call(IPC_CHANNELS.CUSTOMERS_GET, input)
  },
  memberships: {
    sell: (input: SellMembershipInput): Promise<SellMembershipResult> =>
      call(IPC_CHANNELS.MEMBERSHIPS_SELL, input),
    cancel: (input: CancelMembershipInput): Promise<CancelMembershipResult> =>
      call(IPC_CHANNELS.MEMBERSHIPS_CANCEL, input),
    undoCancellation: (input: RevertCancellationInput): Promise<void> =>
      call(IPC_CHANNELS.MEMBERSHIPS_UNDO_CANCELLATION, input),
    renew: (input: RenewMembershipInput): Promise<RenewMembershipResult> =>
      call(IPC_CHANNELS.MEMBERSHIPS_RENEW, input),
    refundState: (input: MembershipRefundStateRequest): Promise<MembershipRefundState> =>
      call(IPC_CHANNELS.MEMBERSHIPS_REFUND_STATE, input)
  },
  blacklist: {
    toggle: (input: {
      personId: number
      action: 'blacklist' | 'unblacklist'
      reason: string | null
    }): Promise<{ personId: number; isBlacklisted: boolean }> =>
      call(IPC_CHANNELS.PERSON_BLACKLIST_TOGGLE, input)
  },
  invoices: {
    list: (): Promise<InvoiceOutput[]> => call(IPC_CHANNELS.INVOICES_LIST),
    get: (input: InvoiceReadIdRequest): Promise<InvoiceOutput | undefined> =>
      call(IPC_CHANNELS.INVOICES_GET, input),
    listByStatus: (input: InvoicesByStatusRequest): Promise<InvoiceOutput[]> =>
      call(IPC_CHANNELS.INVOICES_LIST_BY_STATUS, input)
  },
  dashboard: {
    expirations: (): Promise<MembershipExpirationOutput[]> =>
      call(IPC_CHANNELS.DASHBOARD_EXPIRATIONS),
    paymentsDue: (): Promise<PaymentDueOutput[]> => call(IPC_CHANNELS.DASHBOARD_PAYMENTS_DUE),
    memberRecord: (input: MemberRecordRequest): Promise<MemberRecordOutput | undefined> =>
      call(IPC_CHANNELS.DASHBOARD_MEMBER_RECORD, input),
    paymentRecord: (input: MemberRecordRequest): Promise<MemberRecordOutput | undefined> =>
      call(IPC_CHANNELS.DASHBOARD_PAYMENT_RECORD, input)
  },
  collections: {
    payments: (): Promise<PaymentRecordOutput[]> => call(IPC_CHANNELS.COLLECTIONS_PAYMENTS),
    payment: (paymentId: number): Promise<PaymentRecordOutput | undefined> =>
      call(IPC_CHANNELS.COLLECTIONS_PAYMENT, paymentId)
  },
  identityRead: {
    organization: (): Promise<OrganizationOutput | null> =>
      call(IPC_CHANNELS.IDENTITY_ORGANIZATION),
    staff: (): Promise<StaffMemberOutput[]> => call(IPC_CHANNELS.IDENTITY_STAFF),
    roles: (): Promise<RoleOutput[]> => call(IPC_CHANNELS.IDENTITY_ROLES)
  },
  export: {
    excel: (input: ExportTableInput): Promise<string> => call(IPC_CHANNELS.EXPORT_EXCEL, input)
  },
  license: {
    status: (): Promise<LicenseStatus> => call(IPC_CHANNELS.LICENSE_STATUS)
  },
  person: {
    updatePhoto: (input: UpdatePersonPhotoInput): Promise<PersonPhotoOutput> =>
      call(IPC_CHANNELS.PERSON_PHOTO_UPDATE, input),
    deletePhoto: (input: DeletePersonPhotoInput): Promise<void> =>
      call(IPC_CHANNELS.PERSON_PHOTO_DELETE, input),
    getPhoto: (input: GetPersonPhotoInput): Promise<PersonPhotoOutput> =>
      call(IPC_CHANNELS.PERSON_PHOTO_GET, input),
    getPhotos: (input: GetManyPersonPhotosInput): Promise<GetManyPersonPhotosOutput> =>
      call(IPC_CHANNELS.PERSON_PHOTO_GET_MANY, input)
  },
  organizationLogo: {
    update: (input: UpdateOrgLogoInput): Promise<OrgLogoOutput> =>
      call(IPC_CHANNELS.ORG_LOGO_UPDATE, input),
    remove: (): Promise<void> => call(IPC_CHANNELS.ORG_LOGO_DELETE, {}),
    get: (): Promise<OrgLogoOutput> => call(IPC_CHANNELS.ORG_LOGO_GET, {})
  }
}

export type RendererApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
