/**
 * Billing & Invoicing read models (docs/modules 04, 09 §62).
 *
 * These are presentational aggregates for the invoice register. The real
 * system builds them as read models over the transactional Module 04–05
 * tables — `invoices` + `invoice_lines` (frozen pricing snapshots, §14/§33) +
 * `payments` / `payment_allocations` (settlement, Module 05 §16). Until those
 * exist this is a frontend prototype over seeded mock data; the async facade
 * in `api.ts` is the seam where IPC-backed queries drop in.
 *
 * Amounts are in integer minor units (paise) on the read model (Module 04 §34).
 * `paidMinor` / `outstandingMinor` are derived from the allocations at build
 * time — never maintained by the UI.
 */

import type { PaymentMethod } from '@/lib/payment-methods'

export type { PaymentMethod }

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'

/** Minimal customer reference shown across billing rows. */
export interface CustomerRef {
  id: string
  name: string
  personId?: string
  phone?: string
  email?: string
}

/** One frozen pricing snapshot on the invoice (Module 04 §14, §33). */
export interface InvoiceLine {
  id: string
  description: string
  quantity: number
  unitPriceMinor: number
  discountMinor: number
  taxRateBps: number
  taxAmountMinor: number
  lineTotalMinor: number
}

/** Money received and allocated against this invoice (Module 05 §16). */
export interface InvoiceAllocation {
  id: string
  amountMinor: number
  method: PaymentMethod
  reference: string
  receivedAt: string
  receivedBy: string
}

/** Money returned against a payment allocated to this invoice (Module 05 §17). */
export interface InvoiceRefund {
  id: string
  refundNo: string
  refundDate: string
  amountMinor: number
  method: PaymentMethod
  reason: string
  sourcePaymentNo: string
}

export interface Invoice {
  id: string
  invoiceNo: string
  customer: CustomerRef
  /** Billing snapshot (Module 04 §21) — document history, not the live customer. */
  billingName?: string | null
  billingPhone?: string | null
  billingEmail?: string | null
  billingAddress?: string | null
  issuedAt: string
  dueAt?: string
  status: InvoiceStatus
  lines: InvoiceLine[]
  allocations: InvoiceAllocation[]
  refunds: InvoiceRefund[]
  createdBy: string
  /** Derived, never stored: sum of line amounts before tax. */
  subtotalMinor: number
  /** Derived: sum of per-line tax. */
  taxTotalMinor: number
  /** Derived: subtotal + tax. */
  totalMinor: number
  /** Derived: sum of allocations. */
  paidMinor: number
  /** Derived: total − paid (clamped at 0). */
  outstandingMinor: number
}
