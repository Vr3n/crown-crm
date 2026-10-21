/**
 * Daily Collection read models (docs/modules 05, 09 §63).
 *
 * The daily collection report answers "how much money was recorded on this
 * day" — a live aggregation over the Module 05 `payments` table, grouped by
 * payment method. Nothing here is stored redundantly: the real system would
 * run the aggregation query over the transactional tables, and this prototype
 * stands in for that read model with seeded mock rows (the async facade in
 * `api.ts` is the IPC seam).
 *
 * Amounts are whole rupees on the read model (the domain stores integer paise,
 * Module 04 §34).
 */

import type { PaymentMethod } from '@/lib/payment-methods'

export type { PaymentMethod }

/** Minimal customer reference shown across finance rows. */
export interface CustomerRef {
  id: string
  name: string
  phone?: string
  email?: string
}

/** Which invoice(s) a payment was allocated against (empty = on account). */
export interface PaymentAllocation {
  invoiceNo: string
  amountMinor: number
}

/** A single payment — money that arrived, never edited after the fact. */
export interface PaymentRecord {
  id: string
  reference: string
  customer: CustomerRef
  amountMinor: number
  method: PaymentMethod
  receivedAt: string
  receivedBy: string
  allocations: PaymentAllocation[]
  notes?: string
}

/** Method subtotal within a day's collection. */
export interface MethodTotal {
  method: PaymentMethod
  totalMinor: number
  count: number
}

/** Derived, per-day summary of the collection report. */
export interface DayCollection {
  date: string
  totalMinor: number
  paymentCount: number
  recordedBy: string[]
  byMethod: MethodTotal[]
}
