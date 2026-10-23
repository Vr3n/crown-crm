/**
 * The single source of truth for IPC channel names. Imported by the main
 * process, the preload bridge and the renderer. Never hard-code a channel.
 */
export const IPC_CHANNELS = {
  // Identity and company
  IDENTITY_SETUP: 'identity:setup',
  IDENTITY_LOGIN: 'identity:login',
  IDENTITY_SESSION: 'identity:session',
  IDENTITY_STATUS: 'identity:status',
  IDENTITY_CREATE_STAFF: 'identity:createStaff',
  IDENTITY_CHECK_COMPANY_EXISTS: 'identity:checkCompanyExists',
  IDENTITY_LOGOUT: 'identity:logout',
  IDENTITY_COMPANY: 'identity:company',
  IDENTITY_COMPANY_BY_ID: 'identity:companyById',
  IDENTITY_STAFF: 'identity:staff',
  IDENTITY_ROLES: 'identity:roles',
  IDENTITY_UPDATE_COMPANY: 'identity:updateCompany',

  // Masters
  PARTIES_LIST: 'parties:list',
  PARTIES_GET: 'parties:get',
  PARTIES_CREATE: 'parties:create',
  PARTIES_UPDATE: 'parties:update',
  PARTIES_DEACTIVATE: 'parties:deactivate',

  ITEMS_LIST: 'items:list',
  ITEMS_GET: 'items:get',
  ITEMS_CREATE: 'items:create',
  ITEMS_UPDATE: 'items:update',
  ITEMS_DEACTIVATE: 'items:deactivate',

  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_GROUPS: 'accounts:groups',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_DEACTIVATE: 'accounts:deactivate',
  UNITS_LIST: 'units:list',
  UNITS_CREATE: 'units:create',
  GODOWNS_LIST: 'godowns:list',

  // Vouchers
  VOUCHERS_POST: 'vouchers:post',
  VOUCHERS_GET: 'vouchers:get',
  VOUCHERS_LIST: 'vouchers:list',
  VOUCHERS_CANCEL: 'vouchers:cancel',
  VOUCHERS_OUTSTANDING: 'vouchers:outstanding',
  VOUCHERS_POST_OPENING: 'vouchers:postOpening',

  // Global search
  SEARCH_QUERY: 'search:query',

  // Dashboard
  DASHBOARD_SUMMARY: 'dashboard:summary',

  // Page summaries
  PARTIES_SUMMARY: 'parties:summary',
  ITEMS_SUMMARY: 'items:summary',
  VOUCHERS_SUMMARY: 'vouchers:summary',

  // Export
  EXPORT_PDF: 'export:pdf',
  EXPORT_XLSX: 'export:xlsx',

  // Voucher numbering and first run
  NUMBERING_LIST: 'numbering:list',
  NUMBERING_UPDATE: 'numbering:update',
  ONBOARDING_COMPLETE: 'onboarding:complete',

  // Reports
  REPORTS_TRIAL_BALANCE: 'reports:trialBalance',
  REPORTS_PROFIT_LOSS: 'reports:profitLoss',
  REPORTS_BALANCE_SHEET: 'reports:balanceSheet',
  REPORTS_RECEIVABLES: 'reports:receivables',
  REPORTS_PAYABLES: 'reports:payables',
  REPORTS_AGEING: 'reports:ageing',
  REPORTS_STATEMENT: 'reports:statement',
  REPORTS_REGISTER: 'reports:register',
  REPORTS_STOCK: 'reports:stock',
  REPORTS_STOCK_MOVEMENTS: 'reports:stock-movements',
  // Licensing
  LICENSE_STATUS: 'license:status',

  // Backup
  BACKUP_CREATE: 'backup:create',
  BACKUP_LIST: 'backup:list'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
