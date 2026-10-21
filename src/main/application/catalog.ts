import { withTransaction } from '../db/connection'
import { requirePermission, currentOrganizationId } from '../auth/session'
import {
  cancellationPolicyRepo,
  freezePolicyRepo,
  offerRepo,
  offerVersionRepo,
  planRepo,
  planVersionRepo,
  prorationPolicyRepo
} from '../repositories/catalog'
import { leadRepo } from '../repositories/sales'
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors'
import { validateOfferValue } from '../domain/catalog'
import { PERMISSIONS } from '../db/permissions'
import type {
  CancellationPolicy,
  FreezePolicy,
  MembershipPlan,
  MembershipPlanVersion,
  Offer,
  OfferVersion,
  ProrationPolicy
} from '../domain/catalog'
import type {
  CancellationPolicyRow,
  CreateCancellationPolicyInput,
  CreateFreezePolicyInput,
  CreateOfferInput,
  CreatePlanInput,
  CreateProrationPolicyInput,
  FreezePolicyRow,
  OfferIdRequest,
  OfferRow,
  OfferVersionListRequest,
  OfferVersionRow,
  PlanIdRequest,
  PlanRow,
  PlanVersionListRequest,
  PlanVersionRow,
  PolicyLookupSet,
  ProrationPolicyRow,
  UpdateCancellationPolicyInput,
  UpdateFreezePolicyInput,
  UpdateOfferInput,
  UpdatePlanInput,
  UpdateProrationPolicyInput
} from '../../shared/contracts/catalog'

/**
 * Module 03 (Catalog) application use cases. Plans/offers are reference data that
 * change freely — Memberships/Invoices snapshot their commercial terms at sale
 * time, so editing here never rewrites history. Each use case gates on a
 * permission, derives the org from the session, and owns one `withTransaction`
 * boundary.
 */

function mapPlanToRow(plan: MembershipPlan): PlanRow {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    duration: plan.duration,
    billingFrequency: plan.billingFrequency,
    basePriceMinor: plan.basePriceMinor,
    accessWindow: plan.accessWindow,
    startTime: plan.startTime,
    endTime: plan.endTime,
    taxCode: plan.taxCode,
    taxRateBps: plan.taxRateBps,
    registrationFeeMinor: plan.registrationFeeMinor,
    freezePolicyId: plan.freezePolicyId,
    prorationPolicyId: plan.prorationPolicyId,
    cancellationPolicyId: plan.cancellationPolicyId,
    availableFrom: plan.availableFrom,
    availableTo: plan.availableTo,
    isActive: plan.active,
    createdAt: plan.createdAt
  }
}

/** The current pricing catalog — the Plans screen reads this. */
export function listPlans(): PlanRow[] {
  requirePermission(PERMISSIONS.PLAN_VIEW)
  const organizationId = currentOrganizationId()
  return planRepo.list(organizationId).map(mapPlanToRow)
}

/** Plans available for sale right now — the sales form reads this. */
export function getAvailablePlans(): PlanRow[] {
  requirePermission(PERMISSIONS.PLAN_VIEW)
  const organizationId = currentOrganizationId()
  const today = new Date().toISOString().slice(0, 10)
  return planRepo.listAvailableForSale(organizationId, today).map(mapPlanToRow)
}

/** Adds a reusable commercial definition to the catalog. */
export function createPlan(input: CreatePlanInput): PlanRow {
  requirePermission(PERMISSIONS.PLAN_CREATE)
  const organizationId = currentOrganizationId()
  const name = input.name.trim()
  if (!name) throw new ValidationError('Plan name is required')
  if (planRepo.findByName(organizationId, name)) {
    throw new ConflictError(`A plan named "${name}" already exists`)
  }

  return withTransaction(() => {
    const plan = planRepo.create({
      organizationId,
      name,
      description: input.description?.trim() || null,
      duration: input.duration,
      billingFrequency: input.billingFrequency,
      basePriceMinor: input.basePriceMinor,
      accessWindow: input.accessWindow,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      taxCode: input.taxCode?.trim() || null,
      taxRateBps: input.taxRateBps ?? 0,
      registrationFeeMinor: input.registrationFeeMinor ?? 0,
      freezePolicyId: input.freezePolicyId ?? null,
      prorationPolicyId: input.prorationPolicyId ?? null,
      cancellationPolicyId: input.cancellationPolicyId ?? null,
      availableFrom: input.availableFrom ?? new Date().toISOString().slice(0, 10),
      availableTo: input.availableTo ?? null,
      active: input.isActive
    })
    return mapPlanToRow(plan)
  })
}

/**
 * Edits a plan's live terms — affects only future sales, never existing
 * snapshots. Writes a `membership_plan_versions` row preserving the outgoing
 * `base_price_minor`/`tax_rate_bps` before the new values are applied.
 */
export function updatePlan(input: UpdatePlanInput): PlanRow {
  requirePermission(PERMISSIONS.PLAN_UPDATE)
  const organizationId = currentOrganizationId()
  const existing = planRepo.getById(organizationId, input.planId)
  if (!existing) throw new NotFoundError('Plan not found')

  const name = input.name.trim()
  if (!name) throw new ValidationError('Plan name is required')
  const duplicate = planRepo.findByName(organizationId, name)
  if (duplicate && duplicate.id !== existing.id) {
    throw new ConflictError(`A plan named "${name}" already exists`)
  }

  return withTransaction(() => {
    planVersionRepo.create({
      organizationId,
      planId: existing.id,
      basePriceMinor: existing.basePriceMinor,
      taxRateBps: existing.taxRateBps,
      effectiveFrom: new Date().toISOString()
    })

    planRepo.update(organizationId, existing.id, {
      name,
      description: input.description?.trim() || null,
      duration: input.duration,
      billingFrequency: input.billingFrequency,
      basePriceMinor: input.basePriceMinor,
      accessWindow: input.accessWindow,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      taxCode: input.taxCode?.trim() || null,
      taxRateBps: input.taxRateBps ?? existing.taxRateBps,
      registrationFeeMinor: input.registrationFeeMinor ?? existing.registrationFeeMinor,
      freezePolicyId: input.freezePolicyId ?? existing.freezePolicyId,
      prorationPolicyId: input.prorationPolicyId ?? existing.prorationPolicyId,
      cancellationPolicyId: input.cancellationPolicyId ?? existing.cancellationPolicyId,
      availableFrom: input.availableFrom ?? existing.availableFrom,
      availableTo: input.availableTo ?? existing.availableTo,
      active: input.isActive
    })
    const updated = planRepo.getById(organizationId, existing.id)
    return mapPlanToRow(updated as MembershipPlan)
  })
}

/**
 * Removes a plan from the catalog. Refused while any lead references it — the
 * lead's plan interest is a real FK, so the delete guard protects referential
 * integrity (a referenced plan must be deactivated instead).
 */
export function deletePlan(input: PlanIdRequest): void {
  requirePermission(PERMISSIONS.PLAN_DEACTIVATE)
  const organizationId = currentOrganizationId()
  const existing = planRepo.getById(organizationId, input.planId)
  if (!existing) throw new NotFoundError('Plan not found')
  if (leadRepo.countByPlanId(organizationId, existing.id) > 0) {
    throw new ConflictError('This plan is referenced by leads and cannot be deleted')
  }
  withTransaction(() => {
    planRepo.delete(organizationId, existing.id)
  })
}

/* -------------------------------------------------------------------------- */
/* Plan versions                                                               */
/* -------------------------------------------------------------------------- */

function mapVersionToRow(version: MembershipPlanVersion): PlanVersionRow {
  return {
    id: version.id,
    planId: version.planId,
    basePriceMinor: version.basePriceMinor,
    taxRateBps: version.taxRateBps,
    effectiveFrom: version.effectiveFrom,
    createdAt: version.createdAt
  }
}

/** Version history for a plan — the Plans screen surfaces this after an edit. */
export function listPlanVersions(input: PlanVersionListRequest): PlanVersionRow[] {
  requirePermission(PERMISSIONS.PLAN_VIEW)
  const organizationId = currentOrganizationId()
  if (!planRepo.getById(organizationId, input.planId)) {
    throw new NotFoundError('Plan not found')
  }
  return planVersionRepo.listByPlan(organizationId, input.planId).map(mapVersionToRow)
}

/* -------------------------------------------------------------------------- */
/* Offers                                                                      */
/* -------------------------------------------------------------------------- */

function mapOfferToRow(offer: Offer & { usedCount: number }): OfferRow {
  return {
    id: offer.id,
    name: offer.name,
    description: offer.description,
    discountType: offer.discountType,
    valueMinor: offer.valueMinor,
    applicablePlanIds: offer.applicablePlanIds,
    eligibility: offer.eligibility,
    validFrom: offer.validFrom,
    validTo: offer.validTo,
    maxUsage: offer.maxUsage,
    minPurchaseMinor: offer.minPurchaseMinor,
    active: offer.active,
    usedCount: offer.usedCount,
    createdAt: offer.createdAt
  }
}

/** Validates shared offer rules; returns the trimmed name. */
function validateOfferShape(
  organizationId: number,
  input: Pick<
    CreateOfferInput,
    | 'name'
    | 'discountType'
    | 'valueMinor'
    | 'validFrom'
    | 'validTo'
    | 'maxUsage'
    | 'minPurchaseMinor'
  >,
  excludeOfferId?: number
): string {
  const name = input.name.trim()
  if (!name) throw new ValidationError('Offer name is required')

  const discountError = validateOfferValue(input.discountType, input.valueMinor)
  if (discountError) throw new ValidationError(discountError)

  if (input.validTo !== null && input.validTo !== undefined && input.validTo < input.validFrom) {
    throw new ValidationError('End date must be on or after the start date')
  }

  const duplicate = offerRepo.findByName(organizationId, name)
  if (duplicate && duplicate.id !== excludeOfferId) {
    throw new ConflictError(`An offer named "${name}" already exists`)
  }
  return name
}

/** All offers with derived usage — the Offers screen reads this. */
export function listOffers(): OfferRow[] {
  requirePermission(PERMISSIONS.OFFER_VIEW)
  const organizationId = currentOrganizationId()
  return offerRepo.listWithUsage(organizationId).map(mapOfferToRow)
}

export function getOffer(input: OfferIdRequest): OfferRow {
  requirePermission(PERMISSIONS.OFFER_VIEW)
  const organizationId = currentOrganizationId()
  const offer = offerRepo.getByIdWithUsage(organizationId, input.offerId)
  if (!offer) throw new NotFoundError('Offer not found')
  return mapOfferToRow(offer)
}

export function createOffer(input: CreateOfferInput): OfferRow {
  requirePermission(PERMISSIONS.OFFER_CREATE)
  const organizationId = currentOrganizationId()
  const name = validateOfferShape(organizationId, input)

  const offer = withTransaction(() =>
    offerRepo.create({
      organizationId,
      name,
      description: input.description?.trim() || null,
      discountType: input.discountType,
      valueMinor: input.valueMinor,
      applicablePlanIds: input.applicablePlanIds,
      eligibility: input.eligibility?.trim() || null,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      maxUsage: input.maxUsage ?? null,
      minPurchaseMinor: input.minPurchaseMinor ?? null,
      active: input.active
    })
  )
  return mapOfferToRow({ ...offer, usedCount: 0 })
}

export function updateOffer(input: UpdateOfferInput): OfferRow {
  requirePermission(PERMISSIONS.OFFER_UPDATE)
  const organizationId = currentOrganizationId()
  const existing = offerRepo.getById(organizationId, input.offerId)
  if (!existing) throw new NotFoundError('Offer not found')
  const name = validateOfferShape(organizationId, input, existing.id)

  const offer = withTransaction(() => {
    offerVersionRepo.create({
      organizationId,
      offerId: existing.id,
      discountType: existing.discountType,
      valueMinor: existing.valueMinor,
      effectiveFrom: new Date().toISOString()
    })

    offerRepo.update(organizationId, existing.id, {
      name,
      description: input.description?.trim() || null,
      discountType: input.discountType,
      valueMinor: input.valueMinor,
      applicablePlanIds: input.applicablePlanIds,
      eligibility: input.eligibility?.trim() || null,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      maxUsage: input.maxUsage ?? null,
      minPurchaseMinor: input.minPurchaseMinor ?? null,
      active: input.active
    })
    return offerRepo.getById(organizationId, existing.id) as Offer
  })
  return mapOfferToRow({
    ...offer,
    usedCount: offerRepo.countRedemptions(organizationId, offer.id)
  })
}

function mapOfferVersionToRow(version: OfferVersion): OfferVersionRow {
  return {
    id: version.id,
    offerId: version.offerId,
    discountType: version.discountType,
    valueMinor: version.valueMinor,
    effectiveFrom: version.effectiveFrom,
    createdAt: version.createdAt
  }
}

/** Version history for an offer — the Offers screen surfaces this after an edit. */
export function listOfferVersions(input: OfferVersionListRequest): OfferVersionRow[] {
  requirePermission(PERMISSIONS.OFFER_VIEW)
  const organizationId = currentOrganizationId()
  if (!offerRepo.getById(organizationId, input.offerId)) {
    throw new NotFoundError('Offer not found')
  }
  return offerVersionRepo.listByOffer(organizationId, input.offerId).map(mapOfferVersionToRow)
}

/** Soft-deletes an offer — historical redemptions stay intact. */
export function deactivateOffer(input: OfferIdRequest): void {
  requirePermission(PERMISSIONS.OFFER_DEACTIVATE)
  const organizationId = currentOrganizationId()
  const existing = offerRepo.getById(organizationId, input.offerId)
  if (!existing) throw new NotFoundError('Offer not found')
  withTransaction(() => {
    offerRepo.setActive(organizationId, existing.id, false)
  })
}

/** Offers usable at sale time for a plan — the sale flow reads this. */
export function searchActiveOffers(planId: number): OfferRow[] {
  requirePermission(PERMISSIONS.OFFER_VIEW)
  const organizationId = currentOrganizationId()
  const today = new Date().toISOString().slice(0, 10)
  return offerRepo.listEligibleForPlan(organizationId, planId, today).map(mapOfferToRow)
}

/* -------------------------------------------------------------------------- */
/* Policies (ADR-0008)                                                         */
/* -------------------------------------------------------------------------- */

function mapFreezeToRow(policy: FreezePolicy): FreezePolicyRow {
  return {
    id: policy.id,
    name: policy.name,
    billingBehavior: policy.billingBehavior,
    accessBehavior: policy.accessBehavior,
    extendOrCredit: policy.extendOrCredit,
    feeMinor: policy.feeMinor,
    freeFreezeCountPerYear: policy.freeFreezeCountPerYear,
    description: policy.description,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  }
}

function mapProrationToRow(policy: ProrationPolicy): ProrationPolicyRow {
  return {
    id: policy.id,
    name: policy.name,
    rule: policy.rule,
    description: policy.description,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  }
}

function mapCancellationToRow(policy: CancellationPolicy): CancellationPolicyRow {
  return {
    id: policy.id,
    name: policy.name,
    effectiveRule: policy.effectiveRule,
    noticeDays: policy.noticeDays,
    description: policy.description,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt
  }
}

function assertUniqueName(
  organizationId: number,
  table: 'freeze' | 'proration' | 'cancellation',
  name: string,
  excludeId?: number
): string {
  const trimmed = name.trim()
  if (!trimmed) throw new ValidationError('Policy name is required')
  const exists =
    table === 'freeze'
      ? freezePolicyRepo.findByName(organizationId, trimmed)
      : table === 'proration'
        ? prorationPolicyRepo.findByName(organizationId, trimmed)
        : cancellationPolicyRepo.findByName(organizationId, trimmed)
  if (exists && exists.id !== excludeId) {
    throw new ConflictError(`A policy named "${trimmed}" already exists`)
  }
  return trimmed
}

/** The three policy sets — read by the Plans/Policies admin screens. */
export function listPolicyLookups(): PolicyLookupSet {
  requirePermission(PERMISSIONS.PLAN_VIEW)
  const organizationId = currentOrganizationId()
  return {
    freezePolicies: freezePolicyRepo.list(organizationId).map(mapFreezeToRow),
    prorationPolicies: prorationPolicyRepo.list(organizationId).map(mapProrationToRow),
    cancellationPolicies: cancellationPolicyRepo.list(organizationId).map(mapCancellationToRow)
  }
}

export function createFreezePolicy(input: CreateFreezePolicyInput): FreezePolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const name = assertUniqueName(organizationId, 'freeze', input.name)
  const policy = withTransaction(() =>
    freezePolicyRepo.create({
      organizationId,
      name,
      billingBehavior: input.billingBehavior,
      accessBehavior: input.accessBehavior,
      extendOrCredit: input.extendOrCredit,
      feeMinor: input.feeMinor ?? 0,
      freeFreezeCountPerYear: input.freeFreezeCountPerYear ?? 0,
      description: input.description?.trim() || null
    })
  )
  return mapFreezeToRow(policy)
}

export function updateFreezePolicy(input: UpdateFreezePolicyInput): FreezePolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const existing = freezePolicyRepo.getById(organizationId, input.policyId)
  if (!existing) throw new NotFoundError('Freeze policy not found')
  const name = assertUniqueName(organizationId, 'freeze', input.name, existing.id)
  const policy = withTransaction(() => {
    freezePolicyRepo.update(organizationId, existing.id, {
      name,
      billingBehavior: input.billingBehavior,
      accessBehavior: input.accessBehavior,
      extendOrCredit: input.extendOrCredit,
      feeMinor: input.feeMinor ?? existing.feeMinor,
      freeFreezeCountPerYear: input.freeFreezeCountPerYear ?? existing.freeFreezeCountPerYear,
      description: input.description?.trim() || null
    })
    return freezePolicyRepo.getById(organizationId, existing.id) as FreezePolicy
  })
  return mapFreezeToRow(policy)
}

export function createProrationPolicy(input: CreateProrationPolicyInput): ProrationPolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const name = assertUniqueName(organizationId, 'proration', input.name)
  const policy = withTransaction(() =>
    prorationPolicyRepo.create({
      organizationId,
      name,
      rule: input.rule,
      description: input.description?.trim() || null
    })
  )
  return mapProrationToRow(policy)
}

export function updateProrationPolicy(input: UpdateProrationPolicyInput): ProrationPolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const existing = prorationPolicyRepo.getById(organizationId, input.policyId)
  if (!existing) throw new NotFoundError('Proration policy not found')
  const name = assertUniqueName(organizationId, 'proration', input.name, existing.id)
  const policy = withTransaction(() => {
    prorationPolicyRepo.update(organizationId, existing.id, {
      name,
      rule: input.rule,
      description: input.description?.trim() || null
    })
    return prorationPolicyRepo.getById(organizationId, existing.id) as ProrationPolicy
  })
  return mapProrationToRow(policy)
}

export function createCancellationPolicy(
  input: CreateCancellationPolicyInput
): CancellationPolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const name = assertUniqueName(organizationId, 'cancellation', input.name)
  if (input.effectiveRule === 'NOTICE_DAYS' && !input.noticeDays) {
    throw new ValidationError('Notice days are required for a notice-period policy')
  }
  const policy = withTransaction(() =>
    cancellationPolicyRepo.create({
      organizationId,
      name,
      effectiveRule: input.effectiveRule,
      noticeDays: input.noticeDays ?? null,
      description: input.description?.trim() || null
    })
  )
  return mapCancellationToRow(policy)
}

export function updateCancellationPolicy(
  input: UpdateCancellationPolicyInput
): CancellationPolicyRow {
  requirePermission(PERMISSIONS.SETTINGS_MANAGE)
  const organizationId = currentOrganizationId()
  const existing = cancellationPolicyRepo.getById(organizationId, input.policyId)
  if (!existing) throw new NotFoundError('Cancellation policy not found')
  if (input.effectiveRule === 'NOTICE_DAYS' && !input.noticeDays) {
    throw new ValidationError('Notice days are required for a notice-period policy')
  }
  const name = assertUniqueName(organizationId, 'cancellation', input.name, existing.id)
  const policy = withTransaction(() => {
    cancellationPolicyRepo.update(organizationId, existing.id, {
      name,
      effectiveRule: input.effectiveRule,
      noticeDays: input.noticeDays ?? null,
      description: input.description?.trim() || null
    })
    return cancellationPolicyRepo.getById(organizationId, existing.id) as CancellationPolicy
  })
  return mapCancellationToRow(policy)
}
