import { allocationStatusOf, creditStatusOf } from './build'
import type {
  Credit,
  CreditStatus,
  Payment,
  PaymentAllocationStatus,
  PaymentMethod,
  Refund
} from './types'

/**
 * Finance list filters, run upstream of the tables so search and pagination
 * stay snappy (the DataTable handles sorting + pagination on the filtered set).
 */

export interface PaymentFilters {
  method: PaymentMethod | 'ALL'
  status: PaymentAllocationStatus | 'ALL'
  search: string
}

export function filterPayments(rows: Payment[], f: PaymentFilters): Payment[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((p) => {
    if (f.method !== 'ALL' && p.method !== f.method) return false
    if (f.status !== 'ALL' && allocationStatusOf(p) !== f.status) return false
    if (q) {
      const hay = `${p.paymentNo} ${p.customer.name} ${p.reference ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export interface RefundFilters {
  method: PaymentMethod | 'ALL'
  search: string
}

export function filterRefunds(rows: Refund[], f: RefundFilters): Refund[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((r) => {
    if (f.method !== 'ALL' && r.method !== f.method) return false
    if (q) {
      const hay = `${r.refundNo} ${r.customer.name} ${r.reason} ${r.sourcePaymentNo}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export interface CreditFilters {
  status: CreditStatus | 'ALL'
  search: string
}

export function filterCredits(rows: Credit[], f: CreditFilters): Credit[] {
  const q = f.search.trim().toLowerCase()
  return rows.filter((c) => {
    if (f.status !== 'ALL' && creditStatusOf(c) !== f.status) return false
    if (q) {
      const hay = `${c.creditNo} ${c.customer.name} ${c.reason}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
