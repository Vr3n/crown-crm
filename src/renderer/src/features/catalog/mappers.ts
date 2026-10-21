import type {
  CancellationPolicyRow,
  CreateFreezePolicyInput,
  CreateOfferInput,
  CreatePlanInput,
  FreezePolicyRow,
  OfferRow,
  OfferVersionRow,
  PlanRow,
  PlanVersionRow,
  PolicyLookupSet,
  ProrationPolicyRow
} from '../../../../shared/contracts/catalog'
import type {
  CancellationPolicy,
  FreezePolicy,
  Offer,
  OfferInput,
  OfferVersion,
  Plan,
  PlanInput,
  PlanVersion,
  PolicyLookups,
  ProrationPolicy
} from './types'

/**
 * Catalog wire → display mapping (README "Renderer API layer"). Api methods
 * return the shared-contract wire shape exactly (minor units, ISO dates,
 * `active`); money values pass through unchanged — formatting happens in
 * components via `formatMinor`, parsing in forms via `parseToMinor`.
 */

/** A stable display code derived from the offer name — never stored on the wire. */
export const codeFromName = (name: string): string =>
  name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_-]/g, '')

export function mapPlanRow(row: PlanRow): Plan {
  return {
    id: row.id,
    name: row.name,
    duration: row.duration,
    billing: row.billingFrequency,
    basePriceMinor: row.basePriceMinor,
    accessWindow: row.accessWindow,
    startTime: row.startTime ?? '06:00',
    endTime: row.endTime ?? '23:00',
    taxCode: row.taxCode,
    taxRateBps: row.taxRateBps,
    registrationFeeMinor: row.registrationFeeMinor,
    freezePolicyId: row.freezePolicyId,
    prorationPolicyId: row.prorationPolicyId,
    cancellationPolicyId: row.cancellationPolicyId,
    availableFrom: row.availableFrom,
    availableTo: row.availableTo,
    isActive: row.isActive,
    description: row.description ?? '',
    createdAt: row.createdAt
  }
}

export function mapPlanInput(input: PlanInput): CreatePlanInput {
  return {
    name: input.name,
    description: input.description,
    duration: input.duration,
    billingFrequency: input.billing,
    basePriceMinor: input.basePriceMinor,
    accessWindow: input.accessWindow,
    startTime: input.startTime,
    endTime: input.endTime,
    taxCode: input.taxCode,
    taxRateBps: input.taxRateBps,
    registrationFeeMinor: input.registrationFeeMinor,
    freezePolicyId: input.freezePolicyId,
    prorationPolicyId: input.prorationPolicyId,
    cancellationPolicyId: input.cancellationPolicyId,
    availableFrom: input.availableFrom,
    availableTo: input.availableTo,
    isActive: input.isActive
  }
}

export function mapOfferRow(row: OfferRow): Offer {
  return {
    id: row.id,
    name: row.name,
    code: codeFromName(row.name),
    description: row.description ?? '',
    discountType: row.discountType,
    value: row.valueMinor,
    applicablePlanIds: row.applicablePlanIds,
    minPurchaseMinor: row.minPurchaseMinor ?? 0,
    maxUses: row.maxUsage ?? 0,
    usedCount: row.usedCount,
    startDate: row.validFrom,
    endDate: row.validTo,
    isActive: row.active,
    eligibility: row.eligibility ?? '',
    createdAt: row.createdAt
  }
}

export function mapOfferInput(input: OfferInput): CreateOfferInput {
  return {
    name: input.name,
    description: input.description,
    discountType: input.discountType,
    valueMinor: input.value,
    applicablePlanIds: input.applicablePlanIds,
    eligibility: input.eligibility,
    validFrom: input.startDate,
    validTo: input.endDate || null,
    maxUsage: input.maxUses > 0 ? input.maxUses : null,
    minPurchaseMinor: input.minPurchaseMinor > 0 ? input.minPurchaseMinor : null,
    active: input.isActive
  }
}

export function mapPlanVersionRow(row: PlanVersionRow): PlanVersion {
  return {
    id: row.id,
    planId: row.planId,
    basePriceMinor: row.basePriceMinor,
    taxRateBps: row.taxRateBps,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt
  }
}

export function mapOfferVersionRow(row: OfferVersionRow): OfferVersion {
  return {
    id: row.id,
    offerId: row.offerId,
    discountType: row.discountType,
    value: row.valueMinor,
    effectiveFrom: row.effectiveFrom,
    createdAt: row.createdAt
  }
}

function mapFreezePolicyRow(row: FreezePolicyRow): FreezePolicy {
  return {
    id: row.id,
    name: row.name,
    billingBehavior: row.billingBehavior,
    accessBehavior: row.accessBehavior,
    extendOrCredit: row.extendOrCredit,
    feeMinor: row.feeMinor,
    freeFreezeCountPerYear: row.freeFreezeCountPerYear,
    description: row.description
  }
}

function mapProrationPolicyRow(row: ProrationPolicyRow): ProrationPolicy {
  return {
    id: row.id,
    name: row.name,
    rule: row.rule,
    description: row.description
  }
}

function mapCancellationPolicyRow(row: CancellationPolicyRow): CancellationPolicy {
  return {
    id: row.id,
    name: row.name,
    effectiveRule: row.effectiveRule,
    noticeDays: row.noticeDays,
    description: row.description
  }
}

export function mapPolicyLookupSet(set: PolicyLookupSet): PolicyLookups {
  return {
    freezePolicies: set.freezePolicies.map(mapFreezePolicyRow),
    prorationPolicies: set.prorationPolicies.map(mapProrationPolicyRow),
    cancellationPolicies: set.cancellationPolicies.map(mapCancellationPolicyRow)
  }
}

/** The policy-creation inputs (used by the admin screen when it lands). */
export function mapFreezePolicyCreateInput(
  input: Omit<FreezePolicy, 'id'>
): CreateFreezePolicyInput {
  return {
    name: input.name,
    billingBehavior: input.billingBehavior,
    accessBehavior: input.accessBehavior,
    extendOrCredit: input.extendOrCredit,
    feeMinor: input.feeMinor,
    freeFreezeCountPerYear: input.freeFreezeCountPerYear,
    description: input.description ?? undefined
  }
}
