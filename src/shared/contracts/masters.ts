import { z } from 'zod'

/** Masters: parties, items, accounts and company settings. */

export const partyRoleSchema = z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH'])
export type PartyRole = z.infer<typeof partyRoleSchema>

export interface PartyRow {
  id: number
  name: string
  phone: string | null
  email: string | null
  gstin: string | null
  stateCode: string | null
  billingAddress: string | null
  notes: string | null
  isCustomer: boolean
  isSupplier: boolean
  creditDays: number
  creditLimitMinor: number
  openingBalanceMinor: number
  isActive: boolean
  balanceMinor: number
}

export const partyListInputSchema = z.object({
  query: z.string().max(120).optional(),
  role: partyRoleSchema.default('BOTH'),
  includeInactive: z.boolean().default(false)
})
export type PartyListInput = z.infer<typeof partyListInputSchema>

export const partyIdSchema = z.object({ id: z.number().int().positive() })
export type PartyIdInput = z.infer<typeof partyIdSchema>

export const createPartyInputSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(24).optional().nullable(),
  email: z.string().max(254).optional().nullable(),
  gstin: z.string().max(15).optional().nullable(),
  stateCode: z.string().max(2).optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  isCustomer: z.boolean().default(false),
  isSupplier: z.boolean().default(false),
  creditDays: z.number().int().min(0).max(365).default(0),
  creditLimitMinor: z.number().int().min(0).default(0),
  openingBalanceMinor: z.number().int().default(0),
  openingBalanceDate: z.string().max(10).optional().nullable(),
  notes: z.string().max(1000).optional().nullable()
})
export type CreatePartyInput = z.infer<typeof createPartyInputSchema>

export const updatePartyInputSchema = createPartyInputSchema.partial().extend(partyIdSchema.shape)
export type UpdatePartyInput = z.infer<typeof updatePartyInputSchema>

export interface ItemRow {
  id: number
  name: string
  sku: string | null
  hsnSac: string | null
  uom: string | null
  uomId: number | null
  gstRateBps: number
  isService: boolean
  salePriceMinor: number
  purchasePriceMinor: number
  openingQtyE4: number
  openingRateMinor: number
  stockQtyE4: number
  reorderLevelE4: number
  stockGroupId: number | null
  stockGroup: string | null
  isActive: boolean
}

export const itemListInputSchema = z.object({
  query: z.string().max(120).optional(),
  includeInactive: z.boolean().default(false)
})
export type ItemListInput = z.infer<typeof itemListInputSchema>

export const createItemInputSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(60).optional().nullable(),
  hsnSac: z.string().max(20).optional().nullable(),
  uomId: z.number().int().positive().optional().nullable(),
  gstRateBps: z.number().int().min(0).max(5000).default(0),
  isService: z.boolean().default(false),
  salePriceMinor: z.number().int().min(0).default(0),
  purchasePriceMinor: z.number().int().min(0).default(0),
  openingQtyE4: z.number().int().min(0).default(0),
  openingRateMinor: z.number().int().min(0).default(0),
  reorderLevelE4: z.number().int().min(0).default(0)
})
export type CreateItemInput = z.infer<typeof createItemInputSchema>

export const updateItemInputSchema = createItemInputSchema.partial().extend(partyIdSchema.shape)
export type UpdateItemInput = z.infer<typeof updateItemInputSchema>

export const itemIdSchema = z.object({ id: z.number().int().positive() })

export interface AccountRow {
  id: number
  name: string
  groupName: string
  type: string
  systemKey: string | null
  isSystem: boolean
  isActive: boolean
  balanceMinor: number
}

export interface AccountGroupRow {
  id: number
  name: string
  nature: string
}

export const listAccountsInputSchema = z.object({
  type: z.string().optional(),
  includeInactive: z.boolean().default(false)
})

export const createAccountInputSchema = z.object({
  name: z.string().min(1).max(160),
  groupId: z.number().int().positive(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  openingBalanceMinor: z.number().int().default(0),
  openingBalanceSide: z.enum(['DEBIT', 'CREDIT']).default('DEBIT')
})
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>

/** A unit of measure with the precision its quantities are displayed at. */
export interface UnitRow {
  id: number
  name: string
  symbol: string
  decimals: number
  isSystem: boolean
  isActive: boolean
  usageCount: number
}

export const unitRowSchema = z.object({
  id: z.number(),
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(4),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  usageCount: z.number().int().min(0)
})

export const unitListInputSchema = z.object({
  includeInactive: z.boolean().default(false)
})
export type UnitListInput = z.infer<typeof unitListInputSchema>

export const unitIdSchema = z.object({ id: z.number().int().positive() })

export const createUnitInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  symbol: z.string().trim().min(1).max(10),
  decimals: z.number().int().min(0).max(4).default(0)
})
export type CreateUnitInput = z.infer<typeof createUnitInputSchema>

export const updateUnitInputSchema = createUnitInputSchema.partial().extend({
  ...unitIdSchema.shape,
  isActive: z.boolean().optional()
})
export type UpdateUnitInput = z.infer<typeof updateUnitInputSchema>

const businessDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')

/**
 * A GST/cess combination effective for a closed-open date range. The stored
 * history is append-only: a revision closes the old row the day before the new
 * one starts instead of editing what an old invoice used.
 */
export interface TaxRateRow {
  id: number
  gstRateBps: number
  cessRateBps: number
  description: string | null
  effectiveFrom: string
  effectiveTo: string | null
  isCurrent: boolean
}

export const taxRateRowSchema = z.object({
  id: z.number(),
  gstRateBps: z.number().int().min(0),
  cessRateBps: z.number().int().min(0),
  description: z.string().nullable(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  isCurrent: z.boolean()
})

export const taxRateListInputSchema = z.object({
  /** The business date used to decide which row is current. Defaults to today. */
  asOf: businessDateString.optional(),
  /** Settings shows the full history; item pickers ask for current rows only. */
  includeHistory: z.boolean().default(false)
})
export type TaxRateListInput = z.infer<typeof taxRateListInputSchema>

export const taxRateIdSchema = z.object({ id: z.number().int().positive() })

export const createTaxRateInputSchema = z.object({
  gstRateBps: z.number().int().min(0).max(10000),
  cessRateBps: z.number().int().min(0).max(10000).default(0),
  description: z.string().max(120).optional().nullable(),
  effectiveFrom: businessDateString
})
export type CreateTaxRateInput = z.infer<typeof createTaxRateInputSchema>

export const reviseTaxRateInputSchema = createTaxRateInputSchema.extend(taxRateIdSchema.shape)
export type ReviseTaxRateInput = z.infer<typeof reviseTaxRateInputSchema>

export const retireTaxRateInputSchema = z.object({
  id: z.number().int().positive(),
  effectiveFrom: businessDateString
})
export type RetireTaxRateInput = z.infer<typeof retireTaxRateInputSchema>

export const postOpeningInputSchema = z.object({
  date: z.string().max(10)
})
export type PostOpeningInput = z.infer<typeof postOpeningInputSchema>
