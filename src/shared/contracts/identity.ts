import { z } from 'zod'
import { currencyCodeSchema } from './money'

/**
 * Identity and company contracts. Input shapes are validated at the IPC
 * boundary; domain rules (password length, GSTIN shape, state codes) are
 * enforced in the application layer.
 */

export interface SessionContext {
  companyId: number
  companySlug: string
  companyName: string
  userId: number
  userFullName: string
  userEmail: string
  roleId: number
  roleName: string
  isSuper: boolean
  permissions: string[]
}

export const sessionContextSchema = z.object({
  companyId: z.number(),
  companySlug: z.string(),
  companyName: z.string(),
  userId: z.number(),
  userFullName: z.string(),
  userEmail: z.string(),
  roleId: z.number(),
  roleName: z.string(),
  isSuper: z.boolean(),
  permissions: z.array(z.string())
})

export type AuthStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'

/** Indian state codes are two digits, 01 to 38 (plus 97 for other territory). */
export const stateCodeSchema = z.string().regex(/^\d{2}$/, 'State code must be two digits')

export const setupCompanyInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  currency: currencyCodeSchema.optional(),
  ownerFullName: z.string().min(1).max(120),
  ownerEmail: z.string().min(1).max(254),
  ownerPassword: z.string().min(1).max(256),
  stateCode: stateCodeSchema.default('27'),
  gstin: z.string().max(15).optional(),
  phone: z.string().max(24).optional(),
  booksBeginDate: z.string().max(10).optional()
})
export type SetupCompanyInput = z.infer<typeof setupCompanyInputSchema>

export const setupCompanyLogoInputSchema = z.object({
  filename: z.string().min(1).max(255),
  data: z.string().min(1)
})
export type SetupCompanyLogoInput = z.infer<typeof setupCompanyLogoInputSchema>

export const loginInputSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(256)
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const companyExistenceInputSchema = z.object({
  name: z.string().min(1).max(120),
  ownerEmail: z.string().min(1).max(254)
})
export type CompanyExistenceInput = z.infer<typeof companyExistenceInputSchema>

export const createStaffMemberInputSchema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(256),
  roleName: z.string().min(1).max(120)
})
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberInputSchema>

export const createdStaffMemberSchema = z.object({
  userId: z.number().int().positive()
})
export type CreatedStaffMember = z.infer<typeof createdStaffMemberSchema>

export const updateCompanyInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  legalName: z.string().max(200).optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  pan: z.string().max(10).optional().nullable(),
  stateCode: stateCodeSchema.optional(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  pincode: z.string().max(10).optional().nullable(),
  phone: z.string().max(24).optional().nullable(),
  email: z.string().max(254).optional().nullable(),
  invoiceTerms: z.string().max(2000).optional().nullable(),
  fyStartMonth: z.number().int().min(1).max(12).optional(),
  booksBeginDate: z.string().max(10).optional(),
  costingMethod: z.enum(['WEIGHTED_AVERAGE', 'FIFO']).optional(),
  roundOffMode: z.enum(['INVOICE', 'LINE', 'NONE']).optional(),
  allowNegativeStock: z.boolean().optional()
})
export type UpdateCompanyInput = z.infer<typeof updateCompanyInputSchema>

/** Read model returned to the renderer. */
export interface CompanyProfile {
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
  costingMethod: string
  roundOffMode: string
  allowNegativeStock: boolean
  status: string
}
