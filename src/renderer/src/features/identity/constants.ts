import type { OrgStatus, PermissionGroup, StaffStatus } from './types'
export { CURRENCIES } from '../../../../shared/contracts/money'

/**
 * Identity constants — status metadata and the permission catalog.
 *
 * The catalog mirrors `src/main/db/permissions.ts` (identity codes live in the
 * real seed) plus the business codes Module 15's worked example grants to its
 * starter roles (lead.*, followup.*, membership.sell, invoice.*, payment.*,
 * refund/credit.create, finance.dashboard.view). Codes are grouped so the role
 * editor presents them as data, not a flat list.
 */

/** Variant set of the shared `Badge` (mirrors `@/components/ui/badge`). */
type BadgeTone = 'default' | 'outline' | 'secondary' | 'success' | 'warning' | 'destructive'

/** Timezones offered in the org-edit dialog (Module 14 § 2). */
export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York'
]

export const STAFF_STATUS_META: Record<StaffStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INVITED: { label: 'Invited', tone: 'warning' },
  DISABLED: { label: 'Disabled', tone: 'destructive' }
}

export const ORG_STATUS_META: Record<OrgStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'destructive' },
  TRIAL: { label: 'Trial', tone: 'warning' }
}

/** Permission codes for editing, in seed order. Super roles short-circuit these. */
export const SUPER_ROLE_NAMES = ['Owner', 'Admin'] as const

/** The permission catalog, grouped by bounded context for the role editor. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'sales',
    label: 'Sales',
    permissions: [
      {
        code: 'lead.view',
        label: 'View leads',
        description: 'See the lead pipeline and lead details'
      },
      {
        code: 'lead.create',
        label: 'Create leads',
        description: 'Add new leads from the front desk or a call'
      },
      {
        code: 'lead.update_stage',
        label: 'Move lead stages',
        description: 'Advance or regress a lead through the pipeline'
      },
      {
        code: 'lead.record_activity',
        label: 'Record lead activity',
        description: 'Log calls and interactions against a lead'
      },
      {
        code: 'followup.create',
        label: 'Create follow-ups',
        description: 'Schedule a follow-up against a lead'
      },
      {
        code: 'followup.update',
        label: 'Update follow-ups',
        description: 'Extend a follow-up due date'
      },
      {
        code: 'followup.cancel',
        label: 'Cancel follow-ups',
        description: 'Cancel a scheduled follow-up'
      },
      {
        code: 'followup.complete',
        label: 'Complete follow-ups',
        description: 'Mark a follow-up done and close the loop'
      }
    ]
  },
  {
    id: 'membership',
    label: 'Membership',
    permissions: [
      {
        code: 'membership.sell',
        label: 'Sell a membership',
        description: 'Convert a lead into membership + invoice in one action'
      },
      {
        code: 'membership.freeze',
        label: 'Freeze memberships',
        description: 'Pause a membership for the allowed policy period'
      },
      {
        code: 'membership.renew',
        label: 'Renew memberships',
        description: 'Issue renewals and their invoices'
      }
    ]
  },
  {
    id: 'billing',
    label: 'Billing',
    permissions: [
      {
        code: 'invoice.view',
        label: 'View invoices',
        description: 'See invoices and their payment status'
      },
      {
        code: 'invoice.finalize',
        label: 'Finalize invoices',
        description: 'Confirm an invoice as final after review'
      },
      {
        code: 'payment.record',
        label: 'Record payments',
        description: 'Take and record money received'
      },
      {
        code: 'payment.allocate',
        label: 'Allocate payments',
        description: 'Spread a payment across invoices'
      }
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    permissions: [
      {
        code: 'refund.create',
        label: 'Issue refunds',
        description: 'Record money returned against a payment'
      },
      {
        code: 'credit.create',
        label: 'Add credits',
        description: 'Keep value on account against a future invoice'
      },
      {
        code: 'finance.dashboard.view',
        label: 'Finance dashboards',
        description: 'See collection reports and receivables'
      }
    ]
  },
  {
    id: 'people',
    label: 'People',
    permissions: [
      {
        code: 'customer.view',
        label: 'View customers',
        description: 'Look up customers and their memberships'
      },
      {
        code: 'customer.manage',
        label: 'Manage customers',
        description: 'Edit customer details and attributes'
      }
    ]
  },
  {
    id: 'administration',
    label: 'Administration',
    permissions: [
      {
        code: 'user.view',
        label: 'View staff',
        description: 'See the staff list and their roles'
      },
      {
        code: 'user.create',
        label: 'Add staff',
        description: 'Invite new staff members'
      },
      {
        code: 'user.manage',
        label: 'Manage staff',
        description: 'Change roles and enable/disable accounts'
      },
      {
        code: 'role.view',
        label: 'View roles',
        description: 'See roles and their permission sets'
      },
      {
        code: 'role.manage',
        label: 'Manage roles',
        description: 'Edit role names, descriptions and permissions'
      }
    ]
  },
  {
    id: 'tenancy',
    label: 'Organization',
    permissions: [
      {
        code: 'org.view',
        label: 'View organization',
        description: 'See the organization profile'
      },
      {
        code: 'org.manage',
        label: 'Manage organization',
        description: 'Edit identity, billing and tenancy settings'
      }
    ]
  }
]

export function permissionByCode(code: string): { label: string; description: string } | null {
  for (const group of PERMISSION_GROUPS) {
    for (const p of group.permissions) {
      if (p.code === code) return { label: p.label, description: p.description }
    }
  }
  return null
}
