import { ElectronAPI } from '@electron-toolkit/preload'
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
  CancellationPolicyRow,
  CreateCancellationPolicyInput,
  CreateFreezePolicyInput,
  CreateOfferInput,
  CreatePlanInput,
  CreateProrationPolicyInput,
  FreezePolicyRow,
  OfferIdRequest,
  OfferRow,
  OfferVersionListRequest,
  OfferVersionRow,
  PlanIdRequest,
  PlanRow,
  PlanVersionListRequest,
  PlanVersionRow,
  PolicyLookupSet,
  ProrationPolicyRow,
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
  PaymentRow,
  InvoicePaymentState,
  RefundRow,
  CreditRow,
  PaymentMethodRow,
  OutstandingInvoiceRow
} from '../shared/contracts/finance'
import type { CustomerIdRequest, CustomerRowOutput } from '../shared/contracts/customers'
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
import type {
  AssignLeadInput,
  BulkMoveLeadStageInput,
  BulkMoveLeadStageResult,
  BulkRecordActivityInput,
  BulkRecordActivityResult,
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
import type { LicenseStatus } from '../shared/contracts/license'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      identity: {
        setup: (input: SetupOrganizationInput) => Promise<SessionContext>
        login: (input: LoginInput) => Promise<SessionContext>
        session: () => Promise<SessionContext | null>
        status: () => Promise<AuthStatus>
        createStaff: (input: CreateStaffMemberInput) => Promise<CreatedStaffMember>
        checkOrganizationExists: (input: OrganizationExistenceInput) => Promise<boolean>
        updateOrganization: (input: UpdateOrganizationInput) => Promise<OrganizationOutput>
        logout: () => Promise<boolean>
      }
      leads: {
        create: (input: CreateLeadInput) => Promise<CreatedLead>
        editLead: (input: EditLeadInput) => Promise<void>
        moveStage: (input: MoveLeadStageInput) => Promise<void>
        deleteLeads: (input: DeleteLeadsInput) => Promise<void>
        bulkMoveStage: (input: BulkMoveLeadStageInput) => Promise<BulkMoveLeadStageResult>
        bulkScheduleFollowup: (
          input: BulkScheduleFollowUpInput
        ) => Promise<BulkScheduleFollowUpResult>
        bulkRecordActivity: (input: BulkRecordActivityInput) => Promise<BulkRecordActivityResult>
        recordActivity: (input: RecordLeadActivityInput) => Promise<{ activityId: number }>
        assign: (input: AssignLeadInput) => Promise<void>
        markLost: (input: MarkLeadLostInput) => Promise<void>
        scheduleFollowup: (input: ScheduleFollowUpInput) => Promise<{ followupId: number }>
        completeFollowup: (input: CompleteFollowUpInput) => Promise<void>
        bulkCompleteFollowups: (
          input: BulkCompleteFollowUpsInput
        ) => Promise<BulkCompleteFollowUpsResult>
        updateFollowup: (input: UpdateFollowUpInput) => Promise<void>
        cancelFollowup: (input: CancelFollowUpInput) => Promise<void>
        getDetails: (input: LeadIdRequest) => Promise<LeadDetails | null>
        list: (input: LeadListRequest) => Promise<LeadListResponse>
        getTimeline: (input: LeadIdRequest) => Promise<LeadTimelineEntry[]>
        getNew: () => Promise<{ id: number; personName: string; phone: string }[]>
        getUncontacted: () => Promise<{ id: number; personName: string; phone: string }[]>
        getTodaysFollowups: () => Promise<
          {
            followupId: number
            leadId: number
            title: string
            dueAt: string
          }[]
        >
        getOverdueFollowups: () => Promise<
          {
            followupId: number
            leadId: number
            title: string
            dueAt: string
          }[]
        >
        getTrialsEnding: () => Promise<{ id: number; personName: string; dueAt: string }[]>
        getRecentlyWon: () => Promise<{ id: number; personName: string }[]>
        getRecentlyLost: () => Promise<{ id: number; personName: string }[]>
        getFunnelCounts: () => Promise<FunnelCounts>
        searchPeople: (query: string) => Promise<PeopleList>
        checkPerson: (input: CheckLeadPersonInput) => Promise<LeadPersonAvailability>
        getReferenceData: () => Promise<ReferenceData>
        searchSources: (query: string) => Promise<LeadSourceRow[]>
        createSource: (input: CreateLeadSourceInput) => Promise<LeadSourceRow>
        searchPlanInterests: (query: string) => Promise<PlanOptionRow[]>
        searchGoals: (query: string) => Promise<LeadTextOptionRow[]>
      }
      catalog: {
        listPlans: () => Promise<PlanRow[]>
        listAvailablePlans: () => Promise<PlanRow[]>
        createPlan: (input: CreatePlanInput) => Promise<PlanRow>
        updatePlan: (input: UpdatePlanInput) => Promise<PlanRow>
        deletePlan: (input: PlanIdRequest) => Promise<void>
        listOffers: () => Promise<OfferRow[]>
        getOffer: (input: OfferIdRequest) => Promise<OfferRow>
        createOffer: (input: CreateOfferInput) => Promise<OfferRow>
        updateOffer: (input: UpdateOfferInput) => Promise<OfferRow>
        deactivateOffer: (input: OfferIdRequest) => Promise<void>
        listOfferVersions: (input: OfferVersionListRequest) => Promise<OfferVersionRow[]>
        listPlanVersions: (input: PlanVersionListRequest) => Promise<PlanVersionRow[]>
        listPolicyLookups: () => Promise<PolicyLookupSet>
        createFreezePolicy: (input: CreateFreezePolicyInput) => Promise<FreezePolicyRow>
        updateFreezePolicy: (input: UpdateFreezePolicyInput) => Promise<FreezePolicyRow>
        createProrationPolicy: (input: CreateProrationPolicyInput) => Promise<ProrationPolicyRow>
        updateProrationPolicy: (input: UpdateProrationPolicyInput) => Promise<ProrationPolicyRow>
        createCancellationPolicy: (
          input: CreateCancellationPolicyInput
        ) => Promise<CancellationPolicyRow>
        updateCancellationPolicy: (
          input: UpdateCancellationPolicyInput
        ) => Promise<CancellationPolicyRow>
      }
      billing: {
        createInvoice: (input: CreateInvoiceInput) => Promise<InvoiceRow>
        addLine: (input: AddInvoiceLineInput) => Promise<InvoiceLineRow>
        removeLine: (input: RemoveInvoiceLineInput) => Promise<void>
        finalize: (input: FinalizeInvoiceInput) => Promise<InvoiceRow>
        void: (input: VoidInvoiceInput) => Promise<InvoiceRow>
        markUncollectible: (input: MarkUncollectibleInput) => Promise<InvoiceRow>
        getInvoice: (input: InvoiceIdRequest) => Promise<InvoiceDetail>
        updateSnapshot: (input: UpdateBillingSnapshotInput) => Promise<InvoiceRow>
        nextNumber: (input?: InvoiceNumberPreviewRequest) => Promise<InvoiceNumberPreview>
        listByCustomer: (input: CustomerInvoicesRequest) => Promise<InvoiceRow[]>
        listOpen: () => Promise<InvoiceRow[]>
      }
      finance: {
        recordPayment: (input: RecordPaymentInput) => Promise<PaymentRow>
        allocatePayment: (input: AllocatePaymentInput) => Promise<{ allocationId: number }>
        recordAndAllocate: (
          input: RecordAndAllocatePaymentInput
        ) => Promise<{ paymentId: number; allocationId: number }>
        issueRefund: (input: IssueRefundInput) => Promise<RefundRow>
        issueCredit: (input: IssueCreditInput) => Promise<CreditRow>
        applyCredit: (input: ApplyCreditInput) => Promise<{ creditAllocationId: number }>
        getInvoicePaymentState: (input: InvoicePaymentStateRequest) => Promise<InvoicePaymentState>
        paymentHistory: (input: CustomerPaymentsRequest) => Promise<PaymentRow[]>
        refundHistory: (input: PaymentIdRequest) => Promise<RefundRow[]>
        creditBalance: (input: CustomerCreditBalanceRequest) => Promise<{ balanceMinor: number }>
        listCredits: (input: CustomerCreditBalanceRequest) => Promise<CreditRow[]>
        listPaymentMethods: () => Promise<PaymentMethodRow[]>
        outstandingInvoicesFor: (
          input: OutstandingInvoicesRequest
        ) => Promise<OutstandingInvoiceRow[]>
        listPayments: () => Promise<unknown[]>
        listRefunds: () => Promise<unknown[]>
        listAllCredits: () => Promise<unknown[]>
        processScheduledRefunds: () => Promise<{ issued: number }>
      }
      pdf: {
        exportInvoice: (input: { invoiceId: number; mode?: 'save' | 'preview' }) => Promise<string>
        exportReceipt: (input: { paymentId: number; mode?: 'save' | 'preview' }) => Promise<string>
        exportRefund: (input: { refundId: number; mode?: 'save' | 'preview' }) => Promise<string>
      }
      customers: {
        list: () => Promise<CustomerRowOutput[]>
        get: (input: CustomerIdRequest) => Promise<CustomerRowOutput | undefined>
      }
      invoices: {
        list: () => Promise<InvoiceOutput[]>
        get: (input: InvoiceReadIdRequest) => Promise<InvoiceOutput | undefined>
        listByStatus: (input: InvoicesByStatusRequest) => Promise<InvoiceOutput[]>
      }
      dashboard: {
        expirations: () => Promise<MembershipExpirationOutput[]>
        paymentsDue: () => Promise<PaymentDueOutput[]>
        memberRecord: (input: MemberRecordRequest) => Promise<MemberRecordOutput | undefined>
        paymentRecord: (input: MemberRecordRequest) => Promise<MemberRecordOutput | undefined>
      }
      collections: {
        payments: () => Promise<PaymentRecordOutput[]>
        payment: (paymentId: number) => Promise<PaymentRecordOutput | undefined>
      }
      identityRead: {
        organization: () => Promise<OrganizationOutput | null>
        staff: () => Promise<StaffMemberOutput[]>
        roles: () => Promise<RoleOutput[]>
      }
      memberships: {
        sell: (input: SellMembershipInput) => Promise<SellMembershipResult>
        cancel: (input: CancelMembershipInput) => Promise<CancelMembershipResult>
        undoCancellation: (input: RevertCancellationInput) => Promise<void>
        renew: (input: RenewMembershipInput) => Promise<RenewMembershipResult>
        refundState: (input: MembershipRefundStateRequest) => Promise<MembershipRefundState>
      }
      export: {
        excel: (input: {
          sheetName: string
          filename: string
          columns: { header: string; key: string; width?: number; format?: string }[]
          rows: Record<string, unknown>[]
          currency?: string
          timezone?: string
        }) => Promise<string>
      }
      license: {
        status: () => Promise<LicenseStatus>
      }
      blacklist: {
        toggle: (input: {
          personId: number
          action: 'blacklist' | 'unblacklist'
          reason: string | null
        }) => Promise<{ personId: number; isBlacklisted: boolean }>
      }
      person: {
        updatePhoto: (input: UpdatePersonPhotoInput) => Promise<PersonPhotoOutput>
        deletePhoto: (input: DeletePersonPhotoInput) => Promise<void>
        getPhoto: (input: GetPersonPhotoInput) => Promise<PersonPhotoOutput>
        getPhotos: (input: GetManyPersonPhotosInput) => Promise<GetManyPersonPhotosOutput>
      }
      organizationLogo: {
        update: (input: UpdateOrgLogoInput) => Promise<OrgLogoOutput>
        remove: () => Promise<void>
        get: () => Promise<OrgLogoOutput>
      }
    }
  }
}
