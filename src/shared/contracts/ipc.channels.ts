/**
 * The single source of truth for IPC channel names, imported by both the main
 * process (`src/main/ipc/*`) and the preload bridge. Never hard-code a channel
 * string in a handler or the renderer client.
 */
export const IPC_CHANNELS = {
  IDENTITY_SETUP: 'identity:setup',
  IDENTITY_LOGIN: 'identity:login',
  IDENTITY_SESSION: 'identity:session',
  IDENTITY_STATUS: 'identity:status',
  IDENTITY_CREATE_STAFF: 'identity:createStaff',
  IDENTITY_CHECK_ORGANIZATION_EXISTS: 'identity:checkOrganizationExists',
  IDENTITY_LOGOUT: 'identity:logout',

  LEADS_CREATE: 'leads:create',
  LEADS_EDIT: 'leads:edit',
  LEADS_MOVE_STAGE: 'leads:moveStage',
  LEADS_DELETE: 'leads:delete',
  LEADS_BULK_MOVE_STAGE: 'leads:bulkMoveStage',
  LEADS_BULK_SCHEDULE_FOLLOWUP: 'leads:bulkScheduleFollowup',
  LEADS_BULK_RECORD_ACTIVITY: 'leads:bulkRecordActivity',
  LEADS_RECORD_ACTIVITY: 'leads:recordActivity',
  LEADS_ASSIGN: 'leads:assign',
  LEADS_MARK_LOST: 'leads:markLost',
  LEADS_SCHEDULE_FOLLOWUP: 'leads:scheduleFollowup',
  LEADS_UPDATE_FOLLOWUP: 'leads:updateFollowup',
  LEADS_CANCEL_FOLLOWUP: 'leads:cancelFollowup',
  LEADS_COMPLETE_FOLLOWUP: 'leads:completeFollowup',
  LEADS_BULK_COMPLETE_FOLLOWUPS: 'leads:bulkCompleteFollowups',
  LEADS_LIST: 'leads:list',
  LEADS_GET_DETAILS: 'leads:getDetails',
  LEADS_GET_TIMELINE: 'leads:getTimeline',
  LEADS_GET_NEW: 'leads:getNew',
  LEADS_GET_UNCONTACTED: 'leads:getUncontacted',
  LEADS_GET_TODAYS_FOLLOWUPS: 'leads:getTodaysFollowups',
  LEADS_GET_OVERDUE_FOLLOWUPS: 'leads:getOverdueFollowups',
  LEADS_GET_TRIALS_ENDING: 'leads:getTrialsEnding',
  LEADS_GET_RECENT_WON: 'leads:getRecentlyWon',
  LEADS_GET_RECENT_LOST: 'leads:getRecentlyLost',
  LEADS_GET_FUNNEL_COUNTS: 'leads:getFunnelCounts',
  LEADS_SEARCH_PEOPLE: 'leads:searchPeople',
  LEADS_CHECK_PERSON: 'leads:checkPerson',
  LEADS_GET_REFERENCE: 'leads:getReferenceData',
  LEADS_SEARCH_SOURCES: 'leads:searchSources',
  LEADS_CREATE_SOURCE: 'leads:createSource',
  LEADS_SEARCH_PLAN_INTERESTS: 'leads:searchPlans',
  LEADS_SEARCH_GOALS: 'leads:searchGoals',

  CATALOG_LIST_PLANS: 'catalog:listPlans',
  CATALOG_LIST_AVAILABLE_PLANS: 'catalog:listAvailablePlans',
  CATALOG_CREATE_PLAN: 'catalog:createPlan',
  CATALOG_UPDATE_PLAN: 'catalog:updatePlan',
  CATALOG_DELETE_PLAN: 'catalog:deletePlan',

  CATALOG_LIST_OFFERS: 'catalog:listOffers',
  CATALOG_GET_OFFER: 'catalog:getOffer',
  CATALOG_CREATE_OFFER: 'catalog:createOffer',
  CATALOG_UPDATE_OFFER: 'catalog:updateOffer',
  CATALOG_DEACTIVATE_OFFER: 'catalog:deactivateOffer',
  CATALOG_LIST_PLAN_VERSIONS: 'catalog:listPlanVersions',
  CATALOG_LIST_OFFER_VERSIONS: 'catalog:listOfferVersions',
  CATALOG_LIST_POLICY_LOOKUPS: 'catalog:listPolicyLookups',
  CATALOG_CREATE_FREEZE_POLICY: 'catalog:createFreezePolicy',
  CATALOG_UPDATE_FREEZE_POLICY: 'catalog:updateFreezePolicy',
  CATALOG_CREATE_PRORATION_POLICY: 'catalog:createProrationPolicy',
  CATALOG_UPDATE_PRORATION_POLICY: 'catalog:updateProrationPolicy',
  CATALOG_CREATE_CANCELLATION_POLICY: 'catalog:createCancellationPolicy',
  CATALOG_UPDATE_CANCELLATION_POLICY: 'catalog:updateCancellationPolicy',

  // Billing (Module 04)
  BILLING_CREATE_INVOICE: 'billing:createInvoice',
  BILLING_ADD_LINE: 'billing:addLine',
  BILLING_REMOVE_LINE: 'billing:removeLine',
  BILLING_FINALIZE: 'billing:finalize',
  BILLING_VOID: 'billing:void',
  BILLING_MARK_UNCOLLECTIBLE: 'billing:markUncollectible',
  BILLING_GET_INVOICE: 'billing:getInvoice',
  BILLING_LIST_BY_CUSTOMER: 'billing:listByCustomer',
  BILLING_LIST_OPEN: 'billing:listOpen',
  BILLING_UPDATE_SNAPSHOT: 'billing:updateSnapshot',
  BILLING_NEXT_NUMBER: 'billing:nextNumber',

  // Finance (Module 05)
  FINANCE_RECORD_PAYMENT: 'finance:recordPayment',
  FINANCE_ALLOCATE_PAYMENT: 'finance:allocatePayment',
  FINANCE_RECORD_AND_ALLOCATE: 'finance:recordAndAllocate',
  FINANCE_ISSUE_REFUND: 'finance:issueRefund',
  FINANCE_ISSUE_CREDIT: 'finance:issueCredit',
  FINANCE_APPLY_CREDIT: 'finance:applyCredit',
  FINANCE_GET_INVOICE_STATE: 'finance:getInvoicePaymentState',
  FINANCE_PAYMENT_HISTORY: 'finance:paymentHistory',
  FINANCE_REFUND_HISTORY: 'finance:refundHistory',
  FINANCE_CREDIT_BALANCE: 'finance:creditBalance',
  FINANCE_LIST_CREDITS: 'finance:listCredits',
  FINANCE_LIST_ALL_CREDITS: 'finance:listAllCredits',
  FINANCE_LIST_PAYMENTS: 'finance:listPayments',
  FINANCE_LIST_REFUNDS: 'finance:listRefunds',
  FINANCE_PROCESS_SCHEDULED_REFUNDS: 'finance:processScheduledRefunds',
  FINANCE_LIST_PAYMENT_METHODS: 'finance:listPaymentMethods',
  FINANCE_OUTSTANDING_INVOICES: 'finance:outstandingInvoices',

  // Membership Sale (Module 02+03+04+05 — atomic)
  MEMBERSHIPS_SELL: 'memberships:sell',
  MEMBERSHIPS_CANCEL: 'memberships:cancel',
  MEMBERSHIPS_UNDO_CANCELLATION: 'memberships:undo-cancellation',
  MEMBERSHIPS_RENEW: 'memberships:renew',
  MEMBERSHIPS_REFUND_STATE: 'memberships:refund-state',

  // Customers (Module 02)
  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_GET: 'customers:get',

  // Person blacklist
  PERSON_BLACKLIST_TOGGLE: 'person:blacklistToggle',

  // Invoices (Module 04 read models)
  INVOICES_LIST: 'invoices:list',
  INVOICES_GET: 'invoices:get',
  INVOICES_LIST_BY_STATUS: 'invoices:listByStatus',

  // Dashboard (Module 09)
  DASHBOARD_EXPIRATIONS: 'dashboard:expirations',
  DASHBOARD_PAYMENTS_DUE: 'dashboard:paymentsDue',
  DASHBOARD_MEMBER_RECORD: 'dashboard:memberRecord',
  DASHBOARD_PAYMENT_RECORD: 'dashboard:paymentRecord',

  // Collections (Module 05 reports)
  COLLECTIONS_PAYMENTS: 'collections:payments',
  COLLECTIONS_PAYMENT: 'collections:payment',

  // PDF Generation
  PDF_EXPORT_INVOICE: 'pdf:exportInvoice',
  PDF_EXPORT_RECEIPT: 'pdf:exportReceipt',
  PDF_EXPORT_REFUND: 'pdf:exportRefund',

  // Excel Export
  EXPORT_EXCEL: 'export:excel',

  // Identity read/update
  IDENTITY_ORGANIZATION: 'identity:organization',
  IDENTITY_STAFF: 'identity:staff',
  IDENTITY_ROLES: 'identity:roles',
  IDENTITY_UPDATE_STAFF: 'identity:updateStaff',
  IDENTITY_UPDATE_ROLE: 'identity:updateRole',
  IDENTITY_UPDATE_ORGANIZATION: 'identity:updateOrganization',

  // Licensing
  LICENSE_STATUS: 'license:status',

  // Organization logo (BrandMark)
  ORG_LOGO_UPDATE: 'organization.logo:update',
  ORG_LOGO_DELETE: 'organization.logo:delete',
  ORG_LOGO_GET: 'organization.logo:get',

  // Person Photo (Issue #106)
  PERSON_PHOTO_UPDATE: 'person.photo:update',
  PERSON_PHOTO_DELETE: 'person.photo:delete',
  PERSON_PHOTO_GET: 'person.photo:get',
  PERSON_PHOTO_GET_MANY: 'person.photo:getMany'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
