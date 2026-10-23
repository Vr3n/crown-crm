export type { SessionContext } from '../../shared/contracts/identity'

export type CompanyStatus = 'ACTIVE' | 'SUSPENDED'
export type UserStatus = 'ACTIVE' | 'DISABLED'
export type StaffStatus = 'ACTIVE' | 'INVITED' | 'DISABLED'
export type CostingMethod = 'WEIGHTED_AVERAGE' | 'FIFO'
export type RoundOffMode = 'INVOICE' | 'LINE' | 'NONE'

export interface Company {
  id: number
  slug: string
  name: string
  legalName: string | null
  gstin: string | null
  pan: string | null
  stateCode: string
  address: string | null
  city: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  currency: string
  fyStartMonth: number
  booksBeginDate: string
  invoiceTerms: string | null
  costingMethod: CostingMethod
  roundOffMode: RoundOffMode
  allowNegativeStock: boolean
  status: CompanyStatus
  numberingSetupAt: string | null
  onboardingCompletedAt: string | null
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
  companyId: number
  name: string
  isSystemRole: boolean
  isSuper: boolean
  description: string | null
}

export interface CompanyStaff {
  id: number
  companyId: number
  userId: number
  roleId: number
  status: StaffStatus
  joinedAt: string
}
