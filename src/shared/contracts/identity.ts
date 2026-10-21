import { z } from 'zod'
import { currencyCodeSchema } from './money'

/**
 * Canonical contracts for the identity/tenancy IPC surface (Module 14/15).
 * Input shapes are Zod-validated at the IPC boundary (guidelines §15); the
 * derived types are the single source of truth for main, preload, and renderer
 * (resolves known-gap #6 — no more duplicated SessionContext declarations).
 *
 * Boundary schemas validate shape (presence, length, primitives); domain rules
 * (mobile number format, password length, uniqueness) are enforced in the
 * application layer, where the shipped behavior lives.
 */

/** The Organization Context — the active org, user, role, and resolved permissions. */
export interface SessionContext {
  organizationId: number
  organizationSlug: string
  organizationName: string
  userId: number
  userFullName: string
  userEmail: string
  roleId: number
  roleName: string
  isSuper: boolean
  permissions: string[]
}

export const sessionContextSchema = z.object({
  organizationId: z.number(),
  organizationSlug: z.string(),
  organizationName: z.string(),
  userId: z.number(),
  userFullName: z.string(),
  userEmail: z.string(),
  roleId: z.number(),
  roleName: z.string(),
  isSuper: z.boolean(),
  permissions: z.array(z.string())
})

export type AuthStatus = 'SETUP_REQUIRED' | 'LOGIN_REQUIRED' | 'AUTHENTICATED'

export const setupOrganizationInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).optional(),
  currency: currencyCodeSchema.optional(),
  timezone: z.string().max(64).optional(),
  ownerFullName: z.string().min(1).max(120),
  ownerEmail: z.string().min(1).max(254),
  ownerPassword: z.string().min(1).max(256),
  mobileNumber: z.string().min(1).max(24),
  /**
   * Optional gym logo (BrandMark) picked during first-run setup. Same
   * constraints as the settings uploader (jpg/png/webp, 5MB); stored as a
   * file with only the filename persisted. Absent stays a valid setup.
   */
  logo: z
    .object({
      filename: z.string().min(1).max(255),
      /** Base64-encoded image data (no data-URL prefix). */
      data: z.string().min(1)
    })
    .optional()
})
export type SetupOrganizationInput = z.infer<typeof setupOrganizationInputSchema>

export const loginInputSchema = z.object({
  email: z.string().min(1).max(254),
  password: z.string().min(1).max(256)
})
export type LoginInput = z.infer<typeof loginInputSchema>

export const organizationExistenceInputSchema = z.object({
  name: z.string().min(1).max(120),
  ownerEmail: z.string().min(1).max(254),
  mobileNumber: z.string().min(1).max(24)
})
export type OrganizationExistenceInput = z.infer<typeof organizationExistenceInputSchema>

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

export const updateOrganizationInputSchema = z.object({
  legalName: z.string().max(120).optional().nullable(),
  billingEmail: z.string().max(254).optional().nullable(),
  mobileNumber: z.string().min(1).max(24),
  timezone: z.string().max(64).optional().nullable(),
  currency: currencyCodeSchema,
  /**
   * Per-document Terms & Conditions. Length capped at the boundary (max ~2000
   * chars each) so a PDF footer stays a single page; domain trimming happens in
   * the application layer.
   */
  invoiceTerms: z.string().max(2000).optional().nullable(),
  receiptTerms: z.string().max(2000).optional().nullable(),
  refundTerms: z.string().max(2000).optional().nullable()
})
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>
