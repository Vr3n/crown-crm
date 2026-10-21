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
  IDENTITY_STAFF: 'identity:staff',
  IDENTITY_ROLES: 'identity:roles',
  IDENTITY_UPDATE_COMPANY: 'identity:updateCompany',

  // Dashboard
  DASHBOARD_SUMMARY: 'dashboard:summary',

  // Licensing
  LICENSE_STATUS: 'license:status'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
