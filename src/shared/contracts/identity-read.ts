/**
 * Read models for the staff and role list IPC handlers. The company profile
 * lives in `identity.ts` as `CompanyProfile`.
 */

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
