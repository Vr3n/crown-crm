import { z } from 'zod'

/**
 * Canonical contracts for the catalog/plans IPC surface (Module 03). Prices are
 * integer minor units (paise) across the wire — the renderer converts rupees for
 * display only (guidelines §10). Input shapes are Zod-validated at the IPC
 * boundary; domain rules (name uniqueness, ownership) live in the application layer.
 */

export const PLAN_DURATIONS = ['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'] as const
export type PlanDuration = (typeof PLAN_DURATIONS)[number]

export const PLAN_BILLING_FREQUENCIES = [
  'ONE_TIME',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY'
] as const
export type PlanBillingFrequency = (typeof PLAN_BILLING_FREQUENCIES)[number]

export const PLAN_ACCESS_WINDOWS = ['ALL_HOURS', 'TIMED'] as const
export type PlanAccessWindow = (typeof PLAN_ACCESS_WINDOWS)[number]

export const planRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  duration: z.enum(PLAN_DURATIONS),
  billingFrequency: z.enum(PLAN_BILLING_FREQUENCIES),
  basePriceMinor: z.number().int().nonnegative(),
  accessWindow: z.enum(PLAN_ACCESS_WINDOWS),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  taxCode: z.string().nullable(),
  taxRateBps: z.number().int().nonnegative(),
  registrationFeeMinor: z.number().int().nonnegative(),
  freezePolicyId: z.number().int().positive().nullable(),
  prorationPolicyId: z.number().int().positive().nullable(),
  cancellationPolicyId: z.number().int().positive().nullable(),
  availableFrom: z.string().nullable(),
  availableTo: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string()
})
export type PlanRow = z.infer<typeof planRowSchema>

export const createPlanInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  duration: z.enum(PLAN_DURATIONS),
  billingFrequency: z.enum(PLAN_BILLING_FREQUENCIES),
  basePriceMinor: z.number().int().positive(),
  accessWindow: z.enum(PLAN_ACCESS_WINDOWS),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  taxCode: z.string().max(20).nullable().optional(),
  taxRateBps: z.number().int().nonnegative().optional(),
  registrationFeeMinor: z.number().int().nonnegative().optional(),
  freezePolicyId: z.number().int().positive().nullable().optional(),
  prorationPolicyId: z.number().int().positive().nullable().optional(),
  cancellationPolicyId: z.number().int().positive().nullable().optional(),
  availableFrom: z.string().nullable().optional(),
  availableTo: z.string().nullable().optional(),
  isActive: z.boolean()
})
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>

export const updatePlanInputSchema = createPlanInputSchema.extend({
  planId: z.number().int().positive()
})
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>

export const planIdRequestSchema = z.object({ planId: z.number().int().positive() })
export type PlanIdRequest = z.infer<typeof planIdRequestSchema>

/* -------------------------------------------------------------------------- */
/* Offers (Module 03)                                                         */
/* -------------------------------------------------------------------------- */

export const OFFER_DISCOUNT_TYPES = [
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'OVERRIDE_PRICE',
  'FREE_PERIOD'
] as const
export type OfferDiscountType = (typeof OFFER_DISCOUNT_TYPES)[number]

/**
 * An offer row. Money is integer paise (`valueMinor`/`minPurchaseMinor`), dates
 * are ISO yyyy-mm-dd, and `active` is the raw boolean column — the renderer
 * maps these to its display shape (₹, `isActive`) in `mappers.ts`.
 * `usedCount` is derived from offer_redemptions, never stored.
 */
export const offerRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  description: z.string().nullable(),
  discountType: z.enum(OFFER_DISCOUNT_TYPES),
  valueMinor: z.number().int(),
  applicablePlanIds: z.array(z.number().int().positive()),
  eligibility: z.string().nullable(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  maxUsage: z.number().int().positive().nullable(),
  minPurchaseMinor: z.number().int().nonnegative().nullable(),
  active: z.boolean(),
  usedCount: z.number().int().nonnegative(),
  createdAt: z.string()
})
export type OfferRow = z.infer<typeof offerRowSchema>

export const createOfferInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  discountType: z.enum(OFFER_DISCOUNT_TYPES),
  valueMinor: z.number().int(),
  applicablePlanIds: z.array(z.number().int().positive()),
  eligibility: z.string().max(500).optional(),
  validFrom: z.string().min(1),
  validTo: z.string().nullable().optional(),
  maxUsage: z.number().int().positive().nullable().optional(),
  minPurchaseMinor: z.number().int().nonnegative().nullable().optional(),
  active: z.boolean()
})
export type CreateOfferInput = z.infer<typeof createOfferInputSchema>

export const updateOfferInputSchema = createOfferInputSchema.extend({
  offerId: z.number().int().positive()
})
export type UpdateOfferInput = z.infer<typeof updateOfferInputSchema>

export const offerIdRequestSchema = z.object({ offerId: z.number().int().positive() })
export type OfferIdRequest = z.infer<typeof offerIdRequestSchema>

/* -------------------------------------------------------------------------- */
/* Plan versions (Module 03)                                                   */
/* -------------------------------------------------------------------------- */

export const planVersionRowSchema = z.object({
  id: z.number().int().positive(),
  planId: z.number().int().positive(),
  basePriceMinor: z.number().int().nonnegative(),
  taxRateBps: z.number().int().nonnegative(),
  effectiveFrom: z.string(),
  createdAt: z.string()
})
export type PlanVersionRow = z.infer<typeof planVersionRowSchema>

export const planVersionListRequestSchema = z.object({ planId: z.number().int().positive() })
export type PlanVersionListRequest = z.infer<typeof planVersionListRequestSchema>

/* -------------------------------------------------------------------------- */
/* Offer versions (Module 03)                                                  */
/* -------------------------------------------------------------------------- */

export const offerVersionRowSchema = z.object({
  id: z.number().int().positive(),
  offerId: z.number().int().positive(),
  discountType: z.enum(OFFER_DISCOUNT_TYPES),
  valueMinor: z.number().int(),
  effectiveFrom: z.string(),
  createdAt: z.string()
})
export type OfferVersionRow = z.infer<typeof offerVersionRowSchema>

export const offerVersionListRequestSchema = z.object({ offerId: z.number().int().positive() })
export type OfferVersionListRequest = z.infer<typeof offerVersionListRequestSchema>

/* -------------------------------------------------------------------------- */
/* Policies (Module 03, ADR-0008)                                              */
/* -------------------------------------------------------------------------- */

export const FREEZE_BILLING_BEHAVIORS = ['SUSPEND_BILLING', 'CONTINUE_BILLING'] as const
export type FreezeBillingBehavior = (typeof FREEZE_BILLING_BEHAVIORS)[number]

export const FREEZE_ACCESS_BEHAVIORS = ['NO_ACCESS', 'LIMITED_ACCESS'] as const
export type FreezeAccessBehavior = (typeof FREEZE_ACCESS_BEHAVIORS)[number]

export const FREEZE_EXTEND_OR_CREDIT = ['EXTEND_END_DATE', 'CREDIT_PERIOD', 'NONE'] as const
export type FreezeExtendOrCredit = (typeof FREEZE_EXTEND_OR_CREDIT)[number]

export const PRORATION_RULES = [
  'UPGRADE_CREDIT_UNUSED',
  'DOWNGRADE_CHARGE_REMAINDER',
  'NO_PARTIAL_CREDIT',
  'CUSTOM'
] as const
export type ProrationRule = (typeof PRORATION_RULES)[number]

export const CANCELLATION_EFFECTIVE_RULES = ['IMMEDIATE', 'END_OF_PERIOD', 'NOTICE_DAYS'] as const
export type CancellationEffectiveRule = (typeof CANCELLATION_EFFECTIVE_RULES)[number]

export const freezePolicyRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  billingBehavior: z.enum(FREEZE_BILLING_BEHAVIORS),
  accessBehavior: z.enum(FREEZE_ACCESS_BEHAVIORS),
  extendOrCredit: z.enum(FREEZE_EXTEND_OR_CREDIT),
  feeMinor: z.number().int().nonnegative(),
  freeFreezeCountPerYear: z.number().int().nonnegative(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type FreezePolicyRow = z.infer<typeof freezePolicyRowSchema>

export const prorationPolicyRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  rule: z.enum(PRORATION_RULES),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type ProrationPolicyRow = z.infer<typeof prorationPolicyRowSchema>

export const cancellationPolicyRowSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  effectiveRule: z.enum(CANCELLATION_EFFECTIVE_RULES),
  noticeDays: z.number().int().positive().nullable(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type CancellationPolicyRow = z.infer<typeof cancellationPolicyRowSchema>

export const policyLookupSetSchema = z.object({
  freezePolicies: z.array(freezePolicyRowSchema),
  prorationPolicies: z.array(prorationPolicyRowSchema),
  cancellationPolicies: z.array(cancellationPolicyRowSchema)
})
export type PolicyLookupSet = z.infer<typeof policyLookupSetSchema>

export const createFreezePolicyInputSchema = z.object({
  name: z.string().min(1).max(120),
  billingBehavior: z.enum(FREEZE_BILLING_BEHAVIORS),
  accessBehavior: z.enum(FREEZE_ACCESS_BEHAVIORS),
  extendOrCredit: z.enum(FREEZE_EXTEND_OR_CREDIT),
  feeMinor: z.number().int().nonnegative().optional(),
  freeFreezeCountPerYear: z.number().int().nonnegative().optional(),
  description: z.string().max(500).optional()
})
export type CreateFreezePolicyInput = z.infer<typeof createFreezePolicyInputSchema>

export const updateFreezePolicyInputSchema = createFreezePolicyInputSchema.extend({
  policyId: z.number().int().positive()
})
export type UpdateFreezePolicyInput = z.infer<typeof updateFreezePolicyInputSchema>

export const createProrationPolicyInputSchema = z.object({
  name: z.string().min(1).max(120),
  rule: z.enum(PRORATION_RULES),
  description: z.string().max(500).optional()
})
export type CreateProrationPolicyInput = z.infer<typeof createProrationPolicyInputSchema>

export const updateProrationPolicyInputSchema = createProrationPolicyInputSchema.extend({
  policyId: z.number().int().positive()
})
export type UpdateProrationPolicyInput = z.infer<typeof updateProrationPolicyInputSchema>

export const createCancellationPolicyInputSchema = z.object({
  name: z.string().min(1).max(120),
  effectiveRule: z.enum(CANCELLATION_EFFECTIVE_RULES),
  noticeDays: z.number().int().positive().nullable().optional(),
  description: z.string().max(500).optional()
})
export type CreateCancellationPolicyInput = z.infer<typeof createCancellationPolicyInputSchema>

export const updateCancellationPolicyInputSchema = createCancellationPolicyInputSchema.extend({
  policyId: z.number().int().positive()
})
export type UpdateCancellationPolicyInput = z.infer<typeof updateCancellationPolicyInputSchema>
