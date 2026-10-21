/**
 * Catalog & Offers domain (Module 03). Plans are reference/lookup data — they
 * change freely because Memberships/Invoices snapshot their commercial terms at
 * sale time (Module 03 §10). Prices are integer minor units (paise), never floats.
 */

export type PlanDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type PlanBillingFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'

export type PlanAccessWindow = 'ALL_HOURS' | 'TIMED'

export interface MembershipPlan {
  id: number
  organizationId: number
  name: string
  description: string | null
  duration: PlanDuration
  billingFrequency: PlanBillingFrequency
  basePriceMinor: number
  accessWindow: PlanAccessWindow
  startTime: string | null
  endTime: string | null
  taxCode: string | null
  taxRateBps: number
  registrationFeeMinor: number
  freezePolicyId: number | null
  prorationPolicyId: number | null
  cancellationPolicyId: number | null
  /** ISO date (yyyy-mm-dd) when the plan becomes available for sale. */
  availableFrom: string | null
  /** ISO date; null = open-ended (available until manually deactivated). */
  availableTo: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type OfferDiscountType = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'OVERRIDE_PRICE' | 'FREE_PERIOD'

/**
 * A promotional pricing rule layered on plans. `valueMinor` carries the discount
 * by type: PERCENTAGE stores whole percent, FIXED_AMOUNT/OVERRIDE_PRICE store
 * paise, FREE_PERIOD stores whole months. `applicablePlanIds` is a JSON
 * number[] on the row; the domain uses the parsed array.
 */
export interface Offer {
  id: number
  organizationId: number
  name: string
  description: string | null
  discountType: OfferDiscountType
  valueMinor: number
  applicablePlanIds: number[]
  eligibility: string | null
  validFrom: string
  validTo: string | null
  maxUsage: number | null
  minPurchaseMinor: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface OfferRedemption {
  id: number
  organizationId: number
  offerId: number
  membershipId: number | null
  invoiceId: number | null
  appliedDiscountMinor: number
  redeemedAt: string
  createdBy: number
}

export interface MembershipPlanVersion {
  id: number
  organizationId: number
  planId: number
  basePriceMinor: number
  taxRateBps: number
  effectiveFrom: string
  createdAt: string
}

export interface OfferVersion {
  id: number
  organizationId: number
  offerId: number
  discountType: OfferDiscountType
  valueMinor: number
  effectiveFrom: string
  createdAt: string
}

export type FreezeBillingBehavior = 'SUSPEND_BILLING' | 'CONTINUE_BILLING'
export type FreezeAccessBehavior = 'NO_ACCESS' | 'LIMITED_ACCESS'
export type FreezeExtendOrCredit = 'EXTEND_END_DATE' | 'CREDIT_PERIOD' | 'NONE'

export interface FreezePolicy {
  id: number
  organizationId: number
  name: string
  billingBehavior: FreezeBillingBehavior
  accessBehavior: FreezeAccessBehavior
  extendOrCredit: FreezeExtendOrCredit
  feeMinor: number
  freeFreezeCountPerYear: number
  description: string | null
  createdAt: string
  updatedAt: string
}

export type ProrationRule =
  'UPGRADE_CREDIT_UNUSED' | 'DOWNGRADE_CHARGE_REMAINDER' | 'NO_PARTIAL_CREDIT' | 'CUSTOM'

export interface ProrationPolicy {
  id: number
  organizationId: number
  name: string
  rule: ProrationRule
  description: string | null
  createdAt: string
  updatedAt: string
}

export type CancellationEffectiveRule = 'IMMEDIATE' | 'END_OF_PERIOD' | 'NOTICE_DAYS'

export interface CancellationPolicy {
  id: number
  organizationId: number
  name: string
  effectiveRule: CancellationEffectiveRule
  noticeDays: number | null
  description: string | null
  createdAt: string
  updatedAt: string
}

/** Per-type validation of the value carried in `valueMinor`. Returns an error or null. */
export function validateOfferValue(
  discountType: OfferDiscountType,
  valueMinor: number
): string | null {
  if (!Number.isInteger(valueMinor)) return 'Offer value must be a whole number'
  if (discountType === 'PERCENTAGE') {
    if (valueMinor < 1 || valueMinor > 100) return 'Percentage must be between 1 and 100'
    return null
  }
  if (valueMinor <= 0) {
    return discountType === 'FREE_PERIOD'
      ? 'Free period must be at least 1 month'
      : 'Offer value must be greater than zero'
  }
  return null
}
