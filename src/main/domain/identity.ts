export type { SessionContext } from '../../shared/contracts/identity'

export type OrgStatus = 'ACTIVE' | 'SUSPENDED' | 'TRIAL'
export type UserStatus = 'ACTIVE' | 'DISABLED'
export type StaffStatus = 'ACTIVE' | 'INVITED' | 'DISABLED'

export interface Organization {
  id: number
  slug: string
  name: string
  legalName: string | null
  billingEmail: string | null
  mobileNumber: string
  timezone: string | null
  currency: string
  logo: string | null
  status: OrgStatus
  planTier: string | null
  /** Free-text T&C printed on Invoice Document footers (live-read on print). */
  invoiceTerms: string | null
  /** Free-text T&C printed on Payment Receipt footers (live-read on print). */
  receiptTerms: string | null
  /** Free-text T&C printed on Refund Receipt footers (live-read on print). */
  refundTerms: string | null
  createdAt: string
}

export interface User {
  id: number
  fullName: string
  email: string
  passwordHash: string
  status: UserStatus
  createdAt: string
}

export interface Role {
  id: number
  organizationId: number
  name: string
  isSystemRole: boolean
  isSuper: boolean
  description: string | null
}

export interface OrganizationStaff {
  id: number
  organizationId: number
  userId: number
  roleId: number
  status: StaffStatus
  joinedAt: string
}
