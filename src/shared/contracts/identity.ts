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

export const createStaffMemberInputSchema = z
  .object({
    fullName: z.string().min(1).max(120),
    email: z.string().min(1).max(254),
    password: z.string().min(1).max(256),
    /** Prefer `roleId`; `roleName` stays for older callers and tests. */
    roleId: z.number().int().positive().optional(),
    roleName: z.string().min(1).max(120).optional()
  })
  .refine((value) => value.roleId !== undefined || value.roleName !== undefined, {
    message: 'Choose a role'
  })
export type CreateStaffMemberInput = z.infer<typeof createStaffMemberInputSchema>

export const createdStaffMemberSchema = z.object({
  userId: z.number().int().positive()
})
export type CreatedStaffMember = z.infer<typeof createdStaffMemberSchema>

/**
 * A company logo is stored as a data URL so it travels inside the database
 * backup and needs no second file to restore. The cap is on the encoded text,
 * not the source file: 512 KiB of base64 is roughly 384 KiB of image, which is
 * far above what a 512px logo needs while keeping a `companies` row small.
 */
export const MAX_COMPANY_LOGO_DATA_URL_LENGTH = 512 * 1024

/** PNG, JPEG or WebP only. SVG is excluded: it can carry script and is never needed here. */
const COMPANY_LOGO_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/

export function isCompanyLogoDataUrl(value: string): boolean {
  return COMPANY_LOGO_DATA_URL_RE.test(value)
}

/**
 * The renderer sends the prepared data URL. An empty string or null clears the
 * logo; both are accepted here so the patch can remove it without a second
 * channel.
 */
export const companyLogoInputSchema = z
  .string()
  .max(MAX_COMPANY_LOGO_DATA_URL_LENGTH, 'Logo is too large. Use an image under 512 KB.')
  .refine(
    (value) => value.length === 0 || isCompanyLogoDataUrl(value),
    'Logo must be a PNG, JPEG or WebP image'
  )
  .nullable()

export const updateCompanyInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  logo: companyLogoInputSchema.optional(),
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
  logo: string | null
  invoiceTerms: string | null
  costingMethod: string
  roundOffMode: string
  allowNegativeStock: boolean
  status: string
  numberingSetupAt: string | null
  onboardingCompletedAt: string | null
}
