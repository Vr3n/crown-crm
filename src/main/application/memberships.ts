import { withTransaction } from '../db/connection'
import { getDrizzle } from '../db/connection'
import { requirePermission, currentOrganizationId, requireSession } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import {
  ValidationError,
  NotFoundError,
  OverpaymentNotAllowedError,
  InvalidStateTransitionError,
  RefundExceedsPaymentError
} from '../domain/errors'
import { assertCustomerAllowed, assertPersonAllowed } from './blacklist'
import { calculateSalePricing, type DiscountType } from '../domain/pricing'
import { deriveInvoicePrefix } from '../domain/billing'
import { assertValidBusinessDate, businessDateToUtc } from '../domain/dates'
import { orgTimezone } from './organization'
import {
  calculateProratedRefund,
  resolveCancellationEffectiveDate,
  deriveMembershipStatus
} from '../domain/membership'
import { PaymentAllocationService } from '../domain/finance'
import { leadRepo, personRepo, stageRepo } from '../repositories/sales'
import { planRepo, offerRepo, cancellationPolicyRepo } from '../repositories/catalog'
import {
  customerRepo,
  membershipRepo,
  membershipEventRepo,
  freezeRepo
} from '../repositories/membership'
import { organizationRepo } from '../repositories/identity'
import { idempotencyRepo } from '../repositories/idempotency'
import { invoiceRepo } from '../repositories/billing'
import { allocationRepo, refundRepo } from '../repositories/finance'
import { and, eq } from 'drizzle-orm'
import {
  memberships,
  invoices,
  invoiceLines,
  invoiceSequence,
  payments,
  paymentAllocations,
  offerRedemptions,
  leads,
  leadStages,
  leadActivities,
  leadActivityTypes,
  leadStageHistory,
  membershipEvents,
  idempotencyKeys,
  organizations
} from '../db/schema'
import { formatMinor, type CurrencyCode } from '../../shared/contracts/money'
import type {
  SellMembershipInput,
  SellMembershipResult
} from '../../shared/contracts/membership-sale'
import type {
  CancelMembershipInput,
  CancelMembershipResult,
  RevertCancellationInput,
  RenewMembershipInput,
  RenewMembershipResult,
  MembershipRefundState
} from '../../shared/contracts/membership-cancel-renew'

function daysForDuration(duration: string): number {
  switch (duration) {
    case 'MONTHLY':
      return 30
    case 'QUARTERLY':
      return 90
    case 'HALF_YEARLY':
      return 180
    case 'YEARLY':
      return 365
    default:
      return 30
  }
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function sellMembership(input: SellMembershipInput): SellMembershipResult {
  requirePermission(PERMISSIONS.MEMBERSHIP_SELL)
  const organizationId = currentOrganizationId()
  const session = requireSession()
  const userId = session.userId
  const orgCurrency = (organizationRepo.findById(organizationId)?.currency ?? 'INR') as CurrencyCode

  const existing = idempotencyRepo.find(organizationId, input.transactionId)
  if (existing?.response) {
    try {
      return JSON.parse(existing.response) as SellMembershipResult
    } catch {
      // no-op
    }
  }
  if (input.discountType === 'NONE' && input.discountValueMinor !== null)
    throw new ValidationError('discountValue must be null when discountType is NONE')
  if (input.discountType !== 'NONE' && input.discountValueMinor === null)
    throw new ValidationError('discountValue is required when discountType is not NONE')
  const start = new Date(`${input.startDate}T00:00:00`)
  const end = new Date(`${input.endDate}T00:00:00`)
  const joining = new Date(`${input.joiningDate}T00:00:00`)
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(joining.getTime())
  )
    throw new ValidationError('Invalid joining, start, or end date')
  if (end < start) throw new ValidationError('End date cannot be before start date')
  // Shared billing date (#110): drives BOTH Invoice finalized_at and Payment
  // payment_date. Audit fields (created_at/occurred_at) stay as now.
  assertValidBusinessDate(input.issueDate, 'issueDate')

  const lead = leadRepo.getById(organizationId, input.leadId)
  if (!lead) throw new NotFoundError('Lead not found')
  const person = personRepo.findById(organizationId, lead.personId)
  if (!person) throw new NotFoundError('Person not found for lead')

  assertPersonAllowed(organizationId, lead.personId, 'sell a membership')

  const plan = planRepo.getById(organizationId, input.planId)
  if (!plan) throw new NotFoundError('Plan not found')
  if (!plan.active) throw new ValidationError('Plan is inactive')

  const expectedDays = daysForDuration(plan.duration)
  const minEnd = addDays(input.startDate, expectedDays - 1)
  if (input.endDate < minEnd)
    throw new ValidationError(
      `End date violates ${plan.duration} — should be at least ${minEnd} (${expectedDays} days)`
    )

  let offer: ReturnType<typeof offerRepo.getById> = null
  if (input.offerId !== null) {
    offer = offerRepo.getById(organizationId, input.offerId)
    if (!offer) throw new NotFoundError('Offer not found')
    if (!offer.active) throw new ValidationError('Offer is inactive')
    const today = new Date().toISOString().slice(0, 10)
    if (offer.validFrom > today) throw new ValidationError('Offer not yet valid')
    if (offer.validTo !== null && offer.validTo < today)
      throw new ValidationError('Offer has expired')
    if (offer.applicablePlanIds.length > 0 && !offer.applicablePlanIds.includes(plan.id))
      throw new ValidationError(`Offer "${offer.name}" does not apply to plan "${plan.name}"`)
    if (offer.maxUsage !== null) {
      const used = offerRepo.countRedemptions(organizationId, offer.id)
      if (used >= offer.maxUsage) throw new ValidationError('Offer has reached max usage')
    }
    if (offer.minPurchaseMinor !== null && input.basePriceMinor < offer.minPurchaseMinor)
      throw new ValidationError(
        `Offer requires minimum purchase ${formatMinor(offer.minPurchaseMinor, orgCurrency)}`
      )
  } else if (input.discountType !== 'NONE') {
    throw new ValidationError('Offer must be selected when discount is applied')
  }

  const pricing = calculateSalePricing({
    basePriceMinor: input.basePriceMinor,
    discountType: input.discountType as DiscountType,
    discountValueMinor: input.discountValueMinor
  })
  if (pricing.finalPriceMinor === 0)
    throw new ValidationError('Final price cannot be zero — use the Trial form')

  const result = withTransaction(() => {
    const db = getDrizzle()
    const insideExisting = idempotencyRepo.find(organizationId, input.transactionId)
    if (insideExisting?.response) {
      try {
        return JSON.parse(insideExisting.response) as SellMembershipResult
      } catch {
        // no-op
      }
    }

    let customer = customerRepo.getByPersonId(organizationId, person.id)
    if (!customer) {
      customer = customerRepo.create({
        organizationId,
        personId: person.id,
        billingName: person.fullName,
        billingPhone: person.phone,
        billingEmail: person.email,
        billingAddress: null,
        emergencyContact: null,
        notes: null
      })
    }

    const durationDays =
      Math.floor(
        (new Date(`${input.endDate}T00:00:00`).getTime() -
          new Date(`${input.startDate}T00:00:00`).getTime()) /
          86400000
      ) + 1

    const membershipRow = db
      .insert(memberships)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        plan_name_snapshot: plan.name,
        duration_days_snapshot: durationDays,
        base_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        final_price_minor: pricing.finalPriceMinor,
        tax_rate_bps: plan.taxRateBps,
        joining_date: input.joiningDate,
        start_date: input.startDate,
        end_date: input.endDate,
        billing_frequency: plan.billingFrequency,
        status: 'ACTIVE',
        created_by: userId
      })
      .returning()
      .get() as typeof memberships.$inferSelect
    const membershipId = membershipRow.id

    const invoiceDraft = db
      .insert(invoices)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        membership_id: membershipId,
        number: `DRAFT-${input.transactionId}`,
        status: 'DRAFT',
        billing_name: person.fullName,
        billing_phone: person.phone,
        billing_email: person.email,
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: 0,
        total_minor: pricing.finalPriceMinor,
        created_by: userId
      })
      .returning()
      .get() as typeof invoices.$inferSelect
    const invoiceId = invoiceDraft.id
    const taxAmountMinor = Math.round((pricing.finalPriceMinor * plan.taxRateBps) / 10000)
    const lineTotalMinor = pricing.finalPriceMinor + taxAmountMinor
    if (input.paidAmountMinor > lineTotalMinor) {
      throw new OverpaymentNotAllowedError(
        `Amount paid ${formatMinor(input.paidAmountMinor, orgCurrency)} exceeds invoice total ${formatMinor(lineTotalMinor, orgCurrency)}`
      )
    }
    db.insert(invoiceLines)
      .values({
        organization_id: organizationId,
        invoice_id: invoiceId,
        description: `${plan.name} (${input.startDate} — ${input.endDate})`,
        quantity: 1,
        unit_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        tax_rate_bps: plan.taxRateBps,
        tax_amount_minor: taxAmountMinor,
        line_total_minor: lineTotalMinor,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        sort_order: 0
      })
      .run()

    const org = organizationRepo.findById(organizationId)
    const orgInvoicePrefix =
      db
        .select({ org_invoice_prefix: organizations.org_invoice_prefix })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .get()?.org_invoice_prefix ?? null
    const prefix = deriveInvoicePrefix(org?.name ?? 'ORG', orgInvoicePrefix)
    // Invoice Number follows the shared billing date (#110); derived from the
    // YYYY-MM-DD string so no local-timezone shift can move the day.
    const ddmmYY = `${input.issueDate.slice(8, 10)}${input.issueDate.slice(5, 7)}${input.issueDate.slice(2, 4)}`
    const seqKey = ddmmYY
    const seqRow = db
      .select()
      .from(invoiceSequence)
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, seqKey),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .get() as typeof invoiceSequence.$inferSelect | undefined
    let nextVal = 1
    if (!seqRow) {
      db.insert(invoiceSequence)
        .values({ organization_id: organizationId, year: seqKey, prefix, last_value: 1 })
        .run()
      nextVal = 1
    } else {
      nextVal = (seqRow.last_value as number) + 1
      db.update(invoiceSequence)
        .set({ last_value: nextVal })
        .where(
          and(
            eq(invoiceSequence.organization_id, organizationId),
            eq(invoiceSequence.year, seqKey),
            eq(invoiceSequence.prefix, prefix)
          )
        )
        .run()
    }
    const invoiceNumber = `${prefix}-${ddmmYY}-${String(nextVal).padStart(2, '0')}`
    db.update(invoices)
      .set({
        number: invoiceNumber,
        status:
          input.paidAmountMinor === lineTotalMinor
            ? 'PAID'
            : input.paidAmountMinor === 0
              ? 'OPEN'
              : 'PARTIALLY_PAID',
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: taxAmountMinor,
        total_minor: lineTotalMinor,
        finalized_at: businessDateToUtc(input.issueDate, orgTimezone(organizationId)),
        finalized_by: userId
      })
      .where(eq(invoices.id, invoiceId))
      .run()

    let paymentId = 0
    if (input.paidAmountMinor > 0) {
      const paymentRow = db
        .insert(payments)
        .values({
          organization_id: organizationId,
          customer_id: customer.id,
          payment_date: input.issueDate,
          amount_minor: input.paidAmountMinor,
          payment_method: input.paymentMethod,
          reference: input.reference ?? null,
          created_by: userId
        })
        .returning()
        .get() as typeof payments.$inferSelect
      paymentId = paymentRow.id
      const allocAmount = Math.min(input.paidAmountMinor, lineTotalMinor)
      db.insert(paymentAllocations)
        .values({
          organization_id: organizationId,
          payment_id: paymentId,
          invoice_id: invoiceId,
          amount_minor: allocAmount,
          created_by: userId
        })
        .run()
    }

    const wonStage = db
      .select()
      .from(leadStages)
      .where(and(eq(leadStages.organization_id, organizationId), eq(leadStages.is_won, true)))
      .get() as typeof leadStages.$inferSelect | undefined
    const currentStage = stageRepo.findById(organizationId, lead.currentStageId)
    if (!currentStage) throw new NotFoundError('Current lead stage not found')
    if (currentStage.isLost) throw new ValidationError('A lost lead cannot be sold')

    if (wonStage && !currentStage.isWon) {
      const noteType = db
        .select()
        .from(leadActivityTypes)
        .where(
          and(
            eq(leadActivityTypes.organization_id, organizationId),
            eq(leadActivityTypes.name, 'NOTE')
          )
        )
        .get() as typeof leadActivityTypes.$inferSelect | undefined
      if (!noteType) throw new NotFoundError('NOTE activity type is not configured')
      const conversionActivity = db
        .insert(leadActivities)
        .values({
          organization_id: organizationId,
          lead_id: lead.id,
          type_id: noteType.id,
          note: `Membership sold: ${plan.name} ${input.startDate} → ${input.endDate}`,
          occurred_at: new Date().toISOString(),
          created_by: userId
        })
        .returning({ id: leadActivities.id })
        .get()

      db.update(leads)
        .set({
          customer_id: customer.id,
          current_stage_id: wonStage.id,
          updated_at: new Date().toISOString()
        })
        .where(and(eq(leads.organization_id, organizationId), eq(leads.id, lead.id)))
        .run()
      db.insert(leadStageHistory)
        .values({
          organization_id: organizationId,
          lead_id: lead.id,
          from_stage_id: lead.currentStageId,
          to_stage_id: wonStage.id,
          activity_id: conversionActivity.id,
          reason: null,
          changed_by: userId
        })
        .run()
    } else {
      db.update(leads)
        .set({ customer_id: customer.id })
        .where(and(eq(leads.organization_id, organizationId), eq(leads.id, lead.id)))
        .run()
    }

    db.insert(membershipEvents)
      .values({
        organization_id: organizationId,
        membership_id: membershipId,
        type: 'CREATED',
        data: JSON.stringify({ source: 'MEMBERSHIP_SALE', leadId: lead.id, invoiceId }),
        created_by: userId
      })
      .run()

    if (offer) {
      db.insert(offerRedemptions)
        .values({
          organization_id: organizationId,
          offer_id: offer.id,
          membership_id: membershipId,
          invoice_id: invoiceId,
          applied_discount_minor: pricing.discountMinor,
          created_by: userId
        })
        .run()
    }

    const res: SellMembershipResult = {
      membershipId,
      customerId: customer.id,
      invoiceId,
      invoiceNumber,
      paymentId
    }
    db.insert(idempotencyKeys)
      .values({
        organization_id: organizationId,
        key: input.transactionId,
        response: JSON.stringify(res)
      })
      .run()
    return res
  })

  return result
}

/* -------------------------------------------------------------------------- */
/* Cancellation & Revert                                                      */
/* -------------------------------------------------------------------------- */

/** Collects all refunds across all payments allocated to an invoice. */
function collectRefundsForInvoice(
  organizationId: number,
  invoiceId: number
): Array<{ amountMinor: number }> {
  const allocations = allocationRepo.listByInvoice(organizationId, invoiceId)
  const allRefunds: Array<{ amountMinor: number }> = []
  for (const alloc of allocations) {
    const paymentRefunds = refundRepo.getByPayment(organizationId, alloc.paymentId)
    allRefunds.push(...paymentRefunds)
  }
  return allRefunds
}

/**
 * Cancel a membership. Single command with timing dispatch (R1.1):
 * - IMMEDIATE: status → CANCELLED, optional refund, auto-close freezes
 * - END_OF_PERIOD / NOTICE_DAYS: set cancellation fields, status unchanged (derived)
 *
 * Also handles EXPIRED reason-only (R2.1): just records reason code.
 */
export function cancelMembership(input: CancelMembershipInput): CancelMembershipResult {
  requirePermission(PERMISSIONS.MEMBERSHIP_CANCEL)
  const organizationId = currentOrganizationId()
  const session = requireSession()
  const userId = session.userId

  const membership = membershipRepo.getById(organizationId, input.membershipId)
  if (!membership) throw new NotFoundError('Membership not found')

  assertCustomerAllowed(organizationId, membership.customerId, 'cancel a membership')

  const today = new Date().toISOString().slice(0, 10)

  // Derive effective status (the stored status is a cache; derive at decision time per R1.3)
  const hasActiveFreeze = freezeRepo.getActiveFreeze(organizationId, membership.id, today) !== null
  const effectiveStatus = deriveMembershipStatus(
    membership.startDate,
    membership.endDate,
    today,
    hasActiveFreeze,
    membership.cancellationEffectiveDate
  )

  // EXPIRED reason-only (R2.1): just set reason code, no status change, no refund
  if (effectiveStatus === 'EXPIRED' && input.timing !== 'IMMEDIATE') {
    membershipRepo.setCancellation(organizationId, membership.id, {
      cancellationRequestedAt: null,
      cancellationEffectiveDate: null,
      cancellationReasonCode: input.reasonCode,
      cancellationReason: input.reasonDetail ?? null
    })
    membershipEventRepo.create({
      organizationId,
      membershipId: membership.id,
      type: 'CANCELLED',
      data: JSON.stringify({ timing: input.timing, reasonCode: input.reasonCode }),
      createdBy: userId
    })
    return {
      membershipId: membership.id,
      effectiveDate: membership.endDate,
      status: membership.status,
      refundIssued: false,
      refundScheduled: false,
      refundAmountMinor: 0
    }
  }

  // Validate timing for non-EXPIRED
  if (
    membership.status !== 'ACTIVE' &&
    membership.status !== 'FROZEN' &&
    membership.status !== 'EXPIRED'
  ) {
    throw new InvalidStateTransitionError(`Cannot cancel membership in ${membership.status} status`)
  }

  // Check no pending cancellation already
  if (
    membership.cancellationRequestedAt &&
    membership.cancellationEffectiveDate &&
    membership.cancellationEffectiveDate > today
  ) {
    throw new ValidationError('Membership already has a pending cancellation')
  }

  // Resolve plan for policy
  const plan = planRepo.getById(organizationId, membership.planId)

  // Resolve notice days from the plan's cancellation policy (default 14 days)
  const policy =
    plan?.cancellationPolicyId != null
      ? cancellationPolicyRepo.getById(organizationId, plan.cancellationPolicyId)
      : null

  // Staff override of the notice end date must be strictly after today
  if (input.timing === 'NOTICE_DAYS' && input.noticeEndDate && input.noticeEndDate <= today) {
    throw new ValidationError('Cancellation effective date must be after today')
  }

  // Compute effective date (capped at membership end date in the domain fn)
  const effectiveDate = resolveCancellationEffectiveDate(
    input.timing,
    policy?.noticeDays ?? null,
    membership.endDate,
    today,
    input.noticeEndDate
  )

  // Determine if this is an immediate cancel (effective today or past)
  const isImmediate = input.timing === 'IMMEDIATE' || effectiveDate <= today

  // Auto-close open freezes on immediate cancel (R1.2)
  if (isImmediate) {
    freezeRepo.closeOpenFreezes(organizationId, membership.id, today)
  }

  // Set cancellation fields
  const newStatus = isImmediate ? 'CANCELLED' : membership.status
  membershipRepo.setCancellation(organizationId, membership.id, {
    cancellationRequestedAt: today,
    cancellationEffectiveDate: effectiveDate,
    cancellationReasonCode: input.reasonCode,
    cancellationReason: input.reasonDetail ?? null
  })

  // Update status if immediate
  if (isImmediate) {
    membershipRepo.updateStatus(organizationId, membership.id, 'CANCELLED')
  }

  // Event
  const eventType = isImmediate ? 'CANCELLED' : 'CANCELLATION_REQUESTED'
  membershipEventRepo.create({
    organizationId,
    membershipId: membership.id,
    type: eventType,
    data: JSON.stringify({
      timing: input.timing,
      effectiveDate,
      reasonCode: input.reasonCode
    }),
    createdBy: userId
  })

  // Refund flow (any timing — issued now or scheduled to the effective date)
  let refundIssued = false
  let refundScheduled = false
  let refundAmountMinor = 0

  if (input.refund && input.refund.mode !== 'NONE') {
    // Find invoice from CREATED event
    const invoiceId = membershipEventRepo.getSourceInvoiceId(organizationId, membership.id)
    if (invoiceId) {
      // Get payments allocated to this invoice
      const allocations = allocationRepo.listByInvoice(organizationId, invoiceId)
      const paymentIds = [...new Set(allocations.map((a) => a.paymentId))]
      const paymentRows = paymentIds
        .map((pid) => {
          const p = getDrizzle()
            .select()
            .from(payments)
            .where(and(eq(payments.organization_id, organizationId), eq(payments.id, pid)))
            .get() as typeof payments.$inferSelect | undefined
          return p
        })
        .filter(Boolean) as Array<typeof payments.$inferSelect>

      // Compute refundable per payment (payment amount minus existing ISSUED refunds)
      const paymentRefundables = paymentRows.map((p) => {
        const existingRefunds = refundRepo.getByPayment(organizationId, p.id)
        const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amountMinor, 0)
        return {
          paymentId: p.id,
          amountMinor: p.amount_minor,
          availableMinor: p.amount_minor - totalRefunded
        }
      })

      const totalRefundable = paymentRefundables.reduce((sum, p) => sum + p.availableMinor, 0)

      // Compute requested refund amount
      let requestedAmount = 0
      if (input.refund.mode === 'FULL') {
        requestedAmount = totalRefundable
      } else if (input.refund.mode === 'PRORATED') {
        // Prorated by unused days measured from the cancellation effective date to the
        // end date (industry standard for non-recurring memberships). Freeze-extended
        // end date is honoured via R1.2.
        const totalDays = membership.durationDaysSnapshot
        const startD = new Date(`${membership.startDate}T00:00:00`)
        const effD = new Date(`${effectiveDate}T00:00:00`)
        const usedDays = Math.max(0, Math.floor((effD.getTime() - startD.getTime()) / 86400000) + 1)
        const totalPaid = membership.finalPriceMinor
        requestedAmount = calculateProratedRefund({ paidMinor: totalPaid, usedDays, totalDays })
        requestedAmount = Math.min(requestedAmount, totalRefundable)
      } else if (input.refund.mode === 'CUSTOM') {
        requestedAmount = Math.min(input.refund.amountMinor ?? 0, totalRefundable)
      }

      if (requestedAmount > totalRefundable) {
        throw new RefundExceedsPaymentError(`Refund amount exceeds available ${totalRefundable}`)
      }

      // Schedule refund to the effective date by default for non-immediate cancels;
      // the user can choose to issue it immediately instead.
      const refundTiming = input.refund.timing ?? 'ON_EFFECTIVE_DATE'
      const scheduled = !isImmediate && refundTiming === 'ON_EFFECTIVE_DATE'

      // Split across payments FIFO and create refunds (scheduled or issued)
      let remaining = requestedAmount
      for (const pf of paymentRefundables) {
        if (remaining <= 0) break
        const refundAmount = Math.min(remaining, pf.availableMinor)
        if (refundAmount > 0) {
          refundRepo.create({
            organizationId,
            paymentId: pf.paymentId,
            amountMinor: refundAmount,
            reason: `Membership cancellation — ${membership.planNameSnapshot} (${input.reasonDetail ?? input.reasonCode})`,
            createdBy: userId,
            status: scheduled ? 'SCHEDULED' : 'ISSUED',
            scheduledDate: scheduled ? effectiveDate : null,
            issuedAt: scheduled ? null : today
          })
          remaining -= refundAmount
          if (scheduled) refundScheduled = true
          else refundIssued = true
          refundAmountMinor += refundAmount
        }
      }

      // Re-derive invoice status only when the refund is issued now (money left).
      if (!scheduled) {
        const invoice = invoiceRepo.getById(organizationId, invoiceId)
        if (invoice && invoice.status !== 'VOID' && invoice.status !== 'UNCOLLECTIBLE') {
          const invoiceAllocations = allocationRepo.listByInvoice(organizationId, invoiceId)
          const invoiceRefunds = collectRefundsForInvoice(organizationId, invoiceId)
          const netAllocated = PaymentAllocationService.calculateNetAllocated(
            invoiceAllocations,
            invoiceRefunds
          )
          const newInvoiceStatus = PaymentAllocationService.deriveInvoiceStatus(
            netAllocated,
            invoice.totalMinor
          )
          invoiceRepo.updateStatus(organizationId, invoiceId, newInvoiceStatus)
        }
      }
    }
  }

  return {
    membershipId: membership.id,
    effectiveDate,
    status: newStatus,
    refundIssued,
    refundScheduled,
    refundAmountMinor
  }
}

/**
 * Revert a pending cancellation request (R2.5: revert).
 * Clears cancellation fields before effective date.
 */
export function revertCancellationRequest(input: RevertCancellationInput): void {
  requirePermission(PERMISSIONS.MEMBERSHIP_CANCEL)
  const organizationId = currentOrganizationId()
  const session = requireSession()
  const userId = session.userId

  const membership = membershipRepo.getById(organizationId, input.membershipId)
  if (!membership) throw new NotFoundError('Membership not found')

  assertCustomerAllowed(organizationId, membership.customerId, 'revert a cancellation')

  const today = new Date().toISOString().slice(0, 10)

  // Must have a pending cancellation (effective date in the future)
  if (!membership.cancellationRequestedAt || !membership.cancellationEffectiveDate) {
    throw new ValidationError('No pending cancellation to revert')
  }
  if (membership.cancellationEffectiveDate <= today) {
    throw new ValidationError('Cancellation has already taken effect — cannot revert')
  }

  membershipRepo.clearCancellation(organizationId, membership.id)

  // Soft-delete any SCHEDULED refunds tied to this membership (money never left).
  // Issued refunds stay on record. VOIDED rows are kept for audit.
  const sourceInvoiceId = membershipEventRepo.getSourceInvoiceId(organizationId, membership.id)
  if (sourceInvoiceId) {
    const allocations = allocationRepo.listByInvoice(organizationId, sourceInvoiceId)
    const paymentIds = [...new Set(allocations.map((a) => a.paymentId))]
    const scheduledRefunds = refundRepo.listScheduledByPayments(organizationId, paymentIds)
    for (const r of scheduledRefunds) {
      refundRepo.markVoided(organizationId, r.id)
    }
  }

  membershipEventRepo.create({
    organizationId,
    membershipId: membership.id,
    type: 'CANCELLATION_REVERTED',
    data: JSON.stringify({ revertedAt: today }),
    createdBy: userId
  })
}

/* -------------------------------------------------------------------------- */
/* Renewal                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Renew a membership for an existing customer. Mirrors sellMembership but
 * customer-driven (no lead selection). Creates new membership row + invoice
 * + optional payment + allocation + events.
 */
export function renewMembership(input: RenewMembershipInput): RenewMembershipResult {
  requirePermission(PERMISSIONS.MEMBERSHIP_RENEW)
  const organizationId = currentOrganizationId()
  const session = requireSession()
  const userId = session.userId
  const orgCurrency = (organizationRepo.findById(organizationId)?.currency ?? 'INR') as CurrencyCode

  // Idempotency check
  const existing = idempotencyRepo.find(organizationId, input.transactionId)
  if (existing?.response) {
    try {
      return JSON.parse(existing.response) as RenewMembershipResult
    } catch {
      // no-op
    }
  }

  // Validate discount consistency
  if (input.discountType === 'NONE' && input.discountValueMinor !== null)
    throw new ValidationError('discountValue must be null when discountType is NONE')
  if (input.discountType !== 'NONE' && input.discountValueMinor === null)
    throw new ValidationError('discountValue is required when discountType is not NONE')

  // Validate dates
  const start = new Date(`${input.startDate}T00:00:00`)
  const end = new Date(`${input.endDate}T00:00:00`)
  const joining = new Date(`${input.joiningDate}T00:00:00`)
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    Number.isNaN(joining.getTime())
  )
    throw new ValidationError('Invalid joining, start, or end date')
  if (end < start) throw new ValidationError('End date cannot be before start date')
  // Shared billing date (#110): drives BOTH Invoice finalized_at and Payment
  // payment_date. Audit fields (created_at/occurred_at) stay as now.
  assertValidBusinessDate(input.issueDate, 'issueDate')

  // Validate customer
  const customer = customerRepo.getById(organizationId, input.customerId)
  if (!customer) throw new NotFoundError('Customer not found')
  assertPersonAllowed(organizationId, customer.personId, 'renew a membership')

  // Validate plan
  const plan = planRepo.getById(organizationId, input.planId)
  if (!plan) throw new NotFoundError('Plan not found')
  if (!plan.active) throw new ValidationError('Plan is inactive')

  // Validate duration
  const expectedDays = daysForDuration(plan.duration)
  const minEnd = addDays(input.startDate, expectedDays - 1)
  if (input.endDate < minEnd)
    throw new ValidationError(
      `End date violates ${plan.duration} — should be at least ${minEnd} (${expectedDays} days)`
    )

  // Validate offer
  let offer: ReturnType<typeof offerRepo.getById> = null
  if (input.offerId !== null) {
    offer = offerRepo.getById(organizationId, input.offerId)
    if (!offer) throw new NotFoundError('Offer not found')
    if (!offer.active) throw new ValidationError('Offer is inactive')
    const today = new Date().toISOString().slice(0, 10)
    if (offer.validFrom > today) throw new ValidationError('Offer not yet valid')
    if (offer.validTo !== null && offer.validTo < today)
      throw new ValidationError('Offer has expired')
    if (offer.applicablePlanIds.length > 0 && !offer.applicablePlanIds.includes(plan.id))
      throw new ValidationError(`Offer "${offer.name}" does not apply to plan "${plan.name}"`)
    if (offer.maxUsage !== null) {
      const used = offerRepo.countRedemptions(organizationId, offer.id)
      if (used >= offer.maxUsage) throw new ValidationError('Offer has reached max usage')
    }
    if (offer.minPurchaseMinor !== null && input.basePriceMinor < offer.minPurchaseMinor)
      throw new ValidationError(
        `Offer requires minimum purchase ${formatMinor(offer.minPurchaseMinor, orgCurrency)}`
      )
  } else if (input.discountType !== 'NONE') {
    throw new ValidationError('Offer must be selected when discount is applied')
  }

  // Calculate pricing
  const pricing = calculateSalePricing({
    basePriceMinor: input.basePriceMinor,
    discountType: input.discountType as DiscountType,
    discountValueMinor: input.discountValueMinor
  })
  if (pricing.finalPriceMinor === 0)
    throw new ValidationError('Final price cannot be zero — use the Trial form')

  // Overlap guard (R2.2: any source, but new window must not overlap ACTIVE/FROZEN)
  const overlap = membershipRepo.getOverlappingActive(
    organizationId,
    customer.id,
    input.startDate,
    input.endDate
  )
  if (overlap) {
    throw new ValidationError(
      `Overlaps with existing active membership (${overlap.startDate} — ${overlap.endDate})`
    )
  }

  const result = withTransaction(() => {
    const db = getDrizzle()
    const insideExisting = idempotencyRepo.find(organizationId, input.transactionId)
    if (insideExisting?.response) {
      try {
        return JSON.parse(insideExisting.response) as RenewMembershipResult
      } catch {
        // no-op
      }
    }

    const durationDays =
      Math.floor(
        (new Date(`${input.endDate}T00:00:00`).getTime() -
          new Date(`${input.startDate}T00:00:00`).getTime()) /
          86400000
      ) + 1

    const membershipRow = db
      .insert(memberships)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        plan_name_snapshot: plan.name,
        duration_days_snapshot: durationDays,
        base_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        final_price_minor: pricing.finalPriceMinor,
        tax_rate_bps: plan.taxRateBps,
        joining_date: input.joiningDate,
        start_date: input.startDate,
        end_date: input.endDate,
        billing_frequency: plan.billingFrequency,
        status: 'ACTIVE',
        created_by: userId
      })
      .returning()
      .get() as typeof memberships.$inferSelect
    const membershipId = membershipRow.id

    const invoiceDraft = db
      .insert(invoices)
      .values({
        organization_id: organizationId,
        customer_id: customer.id,
        membership_id: membershipId,
        number: `DRAFT-${input.transactionId}`,
        status: 'DRAFT',
        billing_name: customer.billingName,
        billing_phone: customer.billingPhone,
        billing_email: customer.billingEmail,
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: 0,
        total_minor: pricing.finalPriceMinor,
        created_by: userId
      })
      .returning()
      .get() as typeof invoices.$inferSelect
    const invoiceId = invoiceDraft.id
    const taxAmountMinor = Math.round((pricing.finalPriceMinor * plan.taxRateBps) / 10000)
    const lineTotalMinor = pricing.finalPriceMinor + taxAmountMinor
    if (input.paidAmountMinor > lineTotalMinor) {
      throw new OverpaymentNotAllowedError(
        `Amount paid ${formatMinor(input.paidAmountMinor, orgCurrency)} exceeds invoice total ${formatMinor(lineTotalMinor, orgCurrency)}`
      )
    }
    db.insert(invoiceLines)
      .values({
        organization_id: organizationId,
        invoice_id: invoiceId,
        description: `${plan.name} (${input.startDate} — ${input.endDate})`,
        quantity: 1,
        unit_price_minor: input.basePriceMinor,
        discount_minor: pricing.discountMinor,
        tax_rate_bps: plan.taxRateBps,
        tax_amount_minor: taxAmountMinor,
        line_total_minor: lineTotalMinor,
        plan_id: plan.id,
        offer_id: offer ? offer.id : null,
        sort_order: 0
      })
      .run()

    const orgInvoicePrefix =
      db
        .select({ org_invoice_prefix: organizations.org_invoice_prefix })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .get()?.org_invoice_prefix ?? null
    const org = organizationRepo.findById(organizationId)
    const prefix = deriveInvoicePrefix(org?.name ?? 'ORG', orgInvoicePrefix)
    // Invoice Number follows the shared billing date (#110); derived from the
    // YYYY-MM-DD string so no local-timezone shift can move the day.
    const ddmmYY = `${input.issueDate.slice(8, 10)}${input.issueDate.slice(5, 7)}${input.issueDate.slice(2, 4)}`
    const seqKey = ddmmYY
    const seqRow = db
      .select()
      .from(invoiceSequence)
      .where(
        and(
          eq(invoiceSequence.organization_id, organizationId),
          eq(invoiceSequence.year, seqKey),
          eq(invoiceSequence.prefix, prefix)
        )
      )
      .get() as typeof invoiceSequence.$inferSelect | undefined
    let nextVal = 1
    if (!seqRow) {
      db.insert(invoiceSequence)
        .values({ organization_id: organizationId, year: seqKey, prefix, last_value: 1 })
        .run()
      nextVal = 1
    } else {
      nextVal = (seqRow.last_value as number) + 1
      db.update(invoiceSequence)
        .set({ last_value: nextVal })
        .where(
          and(
            eq(invoiceSequence.organization_id, organizationId),
            eq(invoiceSequence.year, seqKey),
            eq(invoiceSequence.prefix, prefix)
          )
        )
        .run()
    }
    const invoiceNumber = `${prefix}-${ddmmYY}-${String(nextVal).padStart(2, '0')}`
    db.update(invoices)
      .set({
        number: invoiceNumber,
        status:
          input.paidAmountMinor === lineTotalMinor
            ? 'PAID'
            : input.paidAmountMinor === 0
              ? 'OPEN'
              : 'PARTIALLY_PAID',
        subtotal_minor: pricing.finalPriceMinor,
        tax_minor: taxAmountMinor,
        total_minor: lineTotalMinor,
        finalized_at: businessDateToUtc(input.issueDate, orgTimezone(organizationId)),
        finalized_by: userId
      })
      .where(eq(invoices.id, invoiceId))
      .run()

    let paymentId = 0
    if (input.paidAmountMinor > 0) {
      const paymentRow = db
        .insert(payments)
        .values({
          organization_id: organizationId,
          customer_id: customer.id,
          payment_date: input.issueDate,
          amount_minor: input.paidAmountMinor,
          payment_method: input.paymentMethod,
          created_by: userId
        })
        .returning()
        .get() as typeof payments.$inferSelect
      paymentId = paymentRow.id
      const allocAmount = Math.min(input.paidAmountMinor, lineTotalMinor)
      db.insert(paymentAllocations)
        .values({
          organization_id: organizationId,
          payment_id: paymentId,
          invoice_id: invoiceId,
          amount_minor: allocAmount,
          created_by: userId
        })
        .run()
    }

    // RENEWED event on source membership (lineage via events, R1.4)
    if (input.sourceMembershipId) {
      db.insert(membershipEvents)
        .values({
          organization_id: organizationId,
          membership_id: input.sourceMembershipId,
          type: 'RENEWED',
          data: JSON.stringify({ newMembershipId: membershipId, invoiceId }),
          created_by: userId
        })
        .run()
    }

    // CREATED event on new membership
    db.insert(membershipEvents)
      .values({
        organization_id: organizationId,
        membership_id: membershipId,
        type: 'CREATED',
        data: JSON.stringify({
          source: 'MEMBERSHIP_RENEWAL',
          customerId: customer.id,
          invoiceId,
          renewedFromMembershipId: input.sourceMembershipId ?? null
        }),
        created_by: userId
      })
      .run()

    // Offer redemption
    if (offer) {
      db.insert(offerRedemptions)
        .values({
          organization_id: organizationId,
          offer_id: offer.id,
          membership_id: membershipId,
          invoice_id: invoiceId,
          applied_discount_minor: pricing.discountMinor,
          created_by: userId
        })
        .run()
    }

    const res: RenewMembershipResult = {
      membershipId,
      invoiceId,
      invoiceNumber,
      paymentId
    }
    db.insert(idempotencyKeys)
      .values({
        organization_id: organizationId,
        key: input.transactionId,
        response: JSON.stringify(res)
      })
      .run()
    return res
  })

  return result
}

/* -------------------------------------------------------------------------- */
/* Refund State (read model for cancel dialog)                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns the refund state for a membership's source invoice.
 * Used by the cancel dialog to show refundable amounts.
 */
export function getMembershipRefundState(input: { membershipId: number }): MembershipRefundState {
  requirePermission(PERMISSIONS.PAYMENT_VIEW)
  const organizationId = currentOrganizationId()

  const membership = membershipRepo.getById(organizationId, input.membershipId)
  if (!membership) throw new NotFoundError('Membership not found')

  const invoiceId = membershipEventRepo.getSourceInvoiceId(organizationId, membership.id)
  if (!invoiceId) {
    // Legacy / no invoice (R2.4)
    return {
      invoiceId: null,
      invoiceNo: null,
      totalPaidMinor: 0,
      refundedMinor: 0,
      refundableMinor: 0,
      proratedSuggestedMinor: 0,
      startDate: membership.startDate,
      endDate: membership.endDate,
      durationDays: membership.durationDaysSnapshot,
      finalPriceMinor: membership.finalPriceMinor,
      payments: []
    }
  }

  const invoice = invoiceRepo.getById(organizationId, invoiceId)
  if (!invoice) {
    return {
      invoiceId: null,
      invoiceNo: null,
      totalPaidMinor: 0,
      refundedMinor: 0,
      refundableMinor: 0,
      proratedSuggestedMinor: 0,
      startDate: membership.startDate,
      endDate: membership.endDate,
      durationDays: membership.durationDaysSnapshot,
      finalPriceMinor: membership.finalPriceMinor,
      payments: []
    }
  }

  // Get payments allocated to this invoice
  const allocations = allocationRepo.listByInvoice(organizationId, invoiceId)
  const paymentIds = [...new Set(allocations.map((a) => a.paymentId))]

  const payments = paymentIds
    .map((pid) => {
      const allocs = allocations.filter((a) => a.paymentId === pid)
      const totalAllocated = allocs.reduce((sum, a) => sum + a.amountMinor, 0)
      const existingRefunds = refundRepo.getByPayment(organizationId, pid)
      const totalRefunded = existingRefunds.reduce((sum, r) => sum + r.amountMinor, 0)
      const availableMinor = Math.max(0, totalAllocated - totalRefunded)
      return { paymentId: pid, amountMinor: totalAllocated, availableMinor }
    })
    .filter((p) => p.availableMinor > 0)

  const totalPaid = allocations.reduce((sum, a) => sum + a.amountMinor, 0)
  const totalRefunded = paymentIds.reduce((sum, pid) => {
    const refs = refundRepo.getByPayment(organizationId, pid)
    return sum + refs.reduce((s, r) => s + r.amountMinor, 0)
  }, 0)
  const refundableMinor = Math.max(0, totalPaid - totalRefunded)

  // Prorated suggestion
  const today = new Date().toISOString().slice(0, 10)
  const totalDays = membership.durationDaysSnapshot
  const startD = new Date(`${membership.startDate}T00:00:00`)
  const todayD = new Date(`${today}T00:00:00`)
  const usedDays = Math.max(0, Math.floor((todayD.getTime() - startD.getTime()) / 86400000) + 1)
  const proratedSuggestedMinor = Math.min(
    calculateProratedRefund({ paidMinor: membership.finalPriceMinor, usedDays, totalDays }),
    refundableMinor
  )

  return {
    invoiceId,
    invoiceNo: invoice.number,
    totalPaidMinor: totalPaid,
    refundedMinor: totalRefunded,
    refundableMinor,
    proratedSuggestedMinor,
    startDate: membership.startDate,
    endDate: membership.endDate,
    durationDays: membership.durationDaysSnapshot,
    finalPriceMinor: membership.finalPriceMinor,
    payments
  }
}
