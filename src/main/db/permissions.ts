/**
 * The canonical permission catalog. Every code the command layer checks lives
 * here. New permissions are added here AND seeded into the database, so a
 * non-super role can be granted them through RolePermission data.
 *
 * Convention: <domain>.<verb>, for example "voucher.post".
 */
export const PERMISSIONS = {
  COMPANY_VIEW: 'company.view',
  COMPANY_MANAGE: 'company.manage',

  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',

  PARTY_VIEW: 'party.view',
  PARTY_CREATE: 'party.create',
  PARTY_EDIT: 'party.edit',
  PARTY_DEACTIVATE: 'party.deactivate',

  ITEM_VIEW: 'item.view',
  ITEM_CREATE: 'item.create',
  ITEM_EDIT: 'item.edit',
  ITEM_DEACTIVATE: 'item.deactivate',

  VOUCHER_VIEW: 'voucher.view',
  VOUCHER_CREATE: 'voucher.create',
  VOUCHER_POST: 'voucher.post',
  VOUCHER_CANCEL: 'voucher.cancel',

  RECEIPT_VIEW: 'receipt.view',
  RECEIPT_RECORD: 'receipt.record',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_RECORD: 'payment.record',
  NOTE_VIEW: 'note.view',
  NOTE_CREATE: 'note.create',
  JOURNAL_VIEW: 'journal.view',
  JOURNAL_CREATE: 'journal.create',

  REPORT_VIEW: 'report.view',
  REPORT_EXPORT: 'report.export',

  BACKUP_MANAGE: 'backup.manage',
  SETTINGS_MANAGE: 'settings.manage'
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_CODES: readonly string[] = Object.values(PERMISSIONS)
