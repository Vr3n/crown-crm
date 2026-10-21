import type { PersonRef } from '@/features/dashboard/types'

/**
 * Finance read-model domain types (Module 05 — Payments, Refunds, Credits &
 * Outstanding Balances; Module 09 — Reports).
 *
 * The model follows the docs' core discipline: a Payment is money that really
 * arrived, a Refund is money that left, a Credit is value kept inside the
 * business, and the only link between money and obligations is the explicit
 * PaymentAllocation. Amounts are integer rupees in this prototype read model;
 * the transactional layer stores integer paise (Module 04 §"money as integer").
 */

/** Payment methods, configurable per org (Module 05 §15). */
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'

/** Whether the money recorded against a payment has been fully spread over invoices. */
export type PaymentAllocationStatus = 'FULLY_ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'UNALLOCATED'

/** One explicit link: this part of a payment covers this invoice. */
export interface PaymentAllocation {
  invoiceId: string
  invoiceNo: string
  amountMinor: number
}

/** Money recorded as received (Module 05 §15–16). Never edited after the fact. */
export interface Payment {
  id: string
  paymentNo: string
  customer: PersonRef
  paymentDate: string
  amountMinor: number
  method: PaymentMethod
  reference?: string
  notes?: string
  createdBy: string
  allocations: PaymentAllocation[]
  /** Refunds issued against this payment (kept layered on top, never merged in). */
  refundIds: string[]
}

/** Invoice lifecycle relevant to receivable reporting (Module 04 §13). */
export type InvoiceStatus = 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID'

/** An obligation owed for goods/services — the receivable side of finance. */
export interface FinanceInvoice {
  id: string
  invoiceNo: string
  customer: PersonRef
  line: string
  issuedAt: string
  totalMinor: number
  paidMinor: number
  status: InvoiceStatus
}

/** Money returned to the customer (Module 05 §17). Separate, dated, reasoned. */
export interface Refund {
  id: string
  refundNo: string
  customer: PersonRef
  refundDate: string
  amountMinor: number
  sourcePaymentId: string
  sourcePaymentNo: string
  method: PaymentMethod
  status: 'ISSUED' | 'SCHEDULED' | 'VOIDED'
  scheduledDate?: string | null
  reason: string
  createdBy: string
}

/** State of a credit's value: all available, partly used, or fully applied. */
export type CreditStatus = 'AVAILABLE' | 'PARTIALLY_APPLIED' | 'APPLIED'

/** A credit amount applied against a future invoice. */
export interface CreditApplication {
  invoiceNo: string
  amountMinor: number
  appliedAt: string
}

/** Value kept inside the business as a promise against a future invoice (Module 05 §18). */
export interface Credit {
  id: string
  creditNo: string
  customer: PersonRef
  issuedAt: string
  amountMinor: number
  reason: string
  source?: string
  createdBy: string
  applications: CreditApplication[]
}
