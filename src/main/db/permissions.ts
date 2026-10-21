/**
 * The canonical permission catalog. Every code the Command layer checks lives here.
 * New permissions are added here AND seeded into the database (seed.ts) so that
 * non-super roles can be granted them via RolePermission data. The catalog is
 * additive — super roles inherit new codes automatically (no code change needed
 * when a module lands).
 *
 * Convention: <domain>.<verb>, e.g. "user.create".
 */
export const PERMISSIONS = {
  // Identity & tenancy
  ORG_VIEW: 'org.view',
  ORG_MANAGE: 'org.manage',
  USER_VIEW: 'user.view',
  USER_CREATE: 'user.create',
  USER_MANAGE: 'user.manage',
  ROLE_VIEW: 'role.view',
  ROLE_MANAGE: 'role.manage',

  // People
  PERSON_BLACKLIST: 'person.blacklist',

  // Leads & sales pipeline (Module 01)
  LEAD_VIEW: 'lead.view',
  LEAD_CREATE: 'lead.create',
  LEAD_ASSIGN: 'lead.assign',
  LEAD_RECORD_ACTIVITY: 'lead.record_activity',
  LEAD_UPDATE_STAGE: 'lead.update_stage',
  LEAD_MARK_LOST: 'lead.mark_lost',
  LEAD_CONVERT: 'lead.convert',
  LEAD_DELETE: 'lead.delete',
  LEAD_EDIT: 'lead.edit',

  // Follow-ups (Module 01)
  FOLLOWUP_VIEW: 'followup.view',
  FOLLOWUP_CREATE: 'followup.create',
  FOLLOWUP_UPDATE: 'followup.update',
  FOLLOWUP_CANCEL: 'followup.cancel',
  FOLLOWUP_COMPLETE: 'followup.complete',

  // Membership plans (Module 03)
  PLAN_VIEW: 'plan.view',
  PLAN_CREATE: 'plan.create',
  PLAN_UPDATE: 'plan.update',
  PLAN_DEACTIVATE: 'plan.deactivate',

  // Offers (Module 03)
  OFFER_VIEW: 'offer.view',
  OFFER_CREATE: 'offer.create',
  OFFER_UPDATE: 'offer.update',
  OFFER_DEACTIVATE: 'offer.deactivate',

  // Memberships (Module 02)
  MEMBERSHIP_VIEW: 'membership.view',
  MEMBERSHIP_CREATE: 'membership.create',
  MEMBERSHIP_SELL: 'membership.sell',
  MEMBERSHIP_ACTIVATE: 'membership.activate',
  MEMBERSHIP_FREEZE: 'membership.freeze',
  MEMBERSHIP_UNFREEZE: 'membership.unfreeze',
  MEMBERSHIP_RENEW: 'membership.renew',
  MEMBERSHIP_CHANGE_PLAN: 'membership.change_plan',
  MEMBERSHIP_REQUEST_CANCELLATION: 'membership.request_cancellation',
  MEMBERSHIP_CANCEL: 'membership.cancel',

  // Invoices (Module 04)
  INVOICE_VIEW: 'invoice.view',
  INVOICE_CREATE: 'invoice.create',
  INVOICE_FINALIZE: 'invoice.finalize',
  INVOICE_VOID: 'invoice.void',

  // Payments (Module 05)
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_RECORD: 'payment.record',
  PAYMENT_ALLOCATE: 'payment.allocate',

  // Refunds (Module 05)
  REFUND_VIEW: 'refund.view',
  REFUND_CREATE: 'refund.create',

  // Credits (Module 05)
  CREDIT_VIEW: 'credit.view',
  CREDIT_CREATE: 'credit.create',
  CREDIT_APPLY: 'credit.apply',

  // Ops & reporting
  REPORT_VIEW: 'report.view',
  BACKUP_MANAGE: 'backup.manage',
  SETTINGS_MANAGE: 'settings.manage'
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSION_CODES: readonly string[] = Object.values(PERMISSIONS)
