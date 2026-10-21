/**
 * Shared contracts for identity read/update IPC surface.
 * Output types match the renderer's expected shapes exactly.
 */

export interface OrganizationOutput {
  id: number
  slug: string
  name: string
  legalName: string | null
  billingEmail: string | null
  mobileNumber: string
  timezone: string | null
  currency: string
  logo: string | null
  status: string
  planTier: string | null
  invoiceTerms: string | null
  receiptTerms: string | null
  refundTerms: string | null
  createdAt: string
}

export interface StaffMemberOutput {
  id: string
  userId: number
  fullName: string
  email: string
  roleId: string
  roleName: string
  isSuper: boolean
  isSystemRole: boolean
  status: 'ACTIVE' | 'INVITED' | 'DISABLED'
  joinedAt: string
}

export interface RoleOutput {
  id: string
  name: string
  description: string | null
  isSystemRole: boolean
  isSuper: boolean
  permissionCodes: string[]
  memberCount: number
}
