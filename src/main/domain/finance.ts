/**
 * Finance domain (Module 05).
 *
 * Operational finance, not double-entry accounting. PaymentAllocationService
 * handles allocation math, state derivation, and overpayment policy.
 */

import {
  PaymentOverAllocatedError,
  RefundExceedsPaymentError,
  CreditExceedsBalanceError
} from './errors'

export type PaymentMethod = 'CASH' | 'UPI' | 'CREDIT_CARD' | 'DEBIT_CARD'

export interface Payment {
  id: number
  organizationId: number
  customerId: number
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  createdAt: string
  createdBy: number
}

export interface PaymentAllocation {
  id: number
  organizationId: number
  paymentId: number
  invoiceId: number
  amountMinor: number
  createdAt: string
  createdBy: number
}

export type RefundStatus = 'ISSUED' | 'SCHEDULED' | 'VOIDED'

export interface Refund {
  id: number
  organizationId: number
  paymentId: number
  amountMinor: number
  reason: string
  status: RefundStatus
  /** The cancellation effective date this refund is/was scheduled for (SCHEDULED). */
  scheduledDate: string | null
  /** The date money actually left; NULL until issued. */
  issuedAt: string | null
  createdAt: string
  createdBy: number
}

export interface Credit {
  id: number
  organizationId: number
  customerId: number
  amountMinor: number
  remainingMinor: number
  reason: string
  expiresAt: string | null
  createdAt: string
  createdBy: number
}

export interface CreditAllocation {
  id: number
  organizationId: number
  creditId: number
  invoiceId: number
  amountMinor: number
  createdAt: string
  createdBy: number
}

export interface PaymentMethodRecord {
  id: number
  organizationId: number
  name: string
  sortOrder: number
  active: boolean
  createdAt: string
}

/**
 * PaymentAllocationService — pure allocation math (Module 05 §47).
 *
 * Handles: outstanding calculation, status derivation, allocation validation,
 * refund validation, credit validation, and overpayment policy.
 */
export const PaymentAllocationService = {
  /**
   * Calculates the net amount allocated to an invoice from payments + credits, minus refunds.
   * allocated = SUM(payment_allocations) + SUM(credit_allocations) − SUM(refunded toward this invoice)
   */
  calculateNetAllocated(
    allocations: Array<{ amountMinor: number }>,
    refunds: Array<{ amountMinor: number }>,
    creditAllocations: Array<{ amountMinor: number }> = []
  ): number {
    const totalAllocated = allocations.reduce((sum, a) => sum + a.amountMinor, 0)
    const totalCredits = creditAllocations.reduce((sum, c) => sum + c.amountMinor, 0)
    const totalRefunded = refunds.reduce((sum, r) => sum + r.amountMinor, 0)
    return totalAllocated + totalCredits - totalRefunded
  },

  /**
   * Calculates the outstanding balance on an invoice.
   * outstanding = total_minor - net_allocated (clamped to 0)
   */
  calculateOutstanding(invoiceTotalMinor: number, netAllocated: number): number {
    return Math.max(0, invoiceTotalMinor - netAllocated)
  },

  /**
   * Derives the invoice status from allocation math (Module 07 §47).
   * 0                    → OPEN
   * 0 < allocated < total → PARTIALLY_PAID
   * allocated >= total    → PAID
   *
   * Note: VOID and UNCOLLECTIBLE are set by explicit commands, not derived.
   */
  deriveInvoiceStatus(
    netAllocated: number,
    invoiceTotalMinor: number
  ): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
    if (netAllocated <= 0) return 'OPEN'
    if (netAllocated >= invoiceTotalMinor) return 'PAID'
    return 'PARTIALLY_PAID'
  },

  /**
   * Validates that an allocation does not exceed the payment amount or invoice outstanding.
   * Throws PAYMENT_OVER_ALLOCATED if the allocation exceeds the allowed amount.
   */
  validateAllocation(
    paymentAmountMinor: number,
    existingAllocations: Array<{ amountMinor: number }>,
    newAllocationAmount: number,
    invoiceOutstanding: number
  ): void {
    const totalExisting = existingAllocations.reduce((sum, a) => sum + a.amountMinor, 0)
    if (totalExisting + newAllocationAmount > paymentAmountMinor) {
      throw new PaymentOverAllocatedError()
    }
    if (newAllocationAmount > invoiceOutstanding) {
      throw new PaymentOverAllocatedError()
    }
  },

  /**
   * Validates that a refund does not exceed the net paid amount.
   * Throws REFUND_EXCEEDS_PAYMENT if it does.
   */
  validateRefund(netPaidAmount: number, refundAmount: number): void {
    if (refundAmount > netPaidAmount) {
      throw new RefundExceedsPaymentError()
    }
  },

  /**
   * Validates that a credit application does not exceed the remaining credit balance.
   * Throws CREDIT_EXCEEDS_BALANCE if it does.
   */
  validateCreditApplication(creditRemainingMinor: number, applicationAmount: number): void {
    if (applicationAmount > creditRemainingMinor) {
      throw new CreditExceedsBalanceError()
    }
  },

  /**
   * Handles overpayment: when a payment exceeds an invoice's outstanding, the excess
   * is NOT allocated beyond the outstanding amount. The application layer surfaces
   * the unallocated remainder to the staff member.
   *
   * This is a single policy function, unit-tested, so the behavior is identical
   * from every screen (Module 05 §47).
   */
  handleOverpayment(
    paymentAmountMinor: number,
    allocatedAmount: number,
    invoiceOutstanding: number
  ): { allocatedToInvoice: number; unallocatedRemainder: number } {
    const allocatedToInvoice = Math.min(allocatedAmount, invoiceOutstanding)
    const unallocatedRemainder = paymentAmountMinor - allocatedToInvoice
    return { allocatedToInvoice, unallocatedRemainder }
  }
}
