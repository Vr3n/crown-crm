import { PAYMENT_METHODS } from './constants'
import type {
  Credit,
  CreditStatus,
  FinanceInvoice,
  InvoiceStatus,
  Payment,
  PaymentAllocationStatus,
  PaymentMethod,
  Refund
} from './types'

/**
 * Derived finance read models (Module 05 §19, Module 09 §62–63). Everything
 * here is *computed from the source records* — allocated amounts, credit
 * balances and every report number — so nothing is a hand-maintained counter
 * that can drift out of sync with the truth. All money is integer minor units.
 */

export function allocatedAmount(payment: Payment): number {
  return payment.allocations.reduce((sum, a) => sum + a.amountMinor, 0)
}

export function unallocatedAmount(payment: Payment): number {
  return payment.amountMinor - allocatedAmount(payment)
}

export function allocationStatusOf(payment: Payment): PaymentAllocationStatus {
  const allocated = allocatedAmount(payment)
  if (allocated >= payment.amountMinor) return 'FULLY_ALLOCATED'
  if (allocated > 0) return 'PARTIALLY_ALLOCATED'
  return 'UNALLOCATED'
}

export function creditApplied(credit: Credit): number {
  return credit.applications.reduce((sum, a) => sum + a.amountMinor, 0)
}

export function creditRemaining(credit: Credit): number {
  return credit.amountMinor - creditApplied(credit)
}

export function creditStatusOf(credit: Credit): CreditStatus {
  const applied = creditApplied(credit)
  if (applied >= credit.amountMinor) return 'APPLIED'
  if (applied > 0) return 'PARTIALLY_APPLIED'
  return 'AVAILABLE'
}

/** Amount still owed on an invoice (0 once void). */
export function invoiceDue(invoice: FinanceInvoice): number {
  return invoice.status === 'VOID' ? 0 : Math.max(0, invoice.totalMinor - invoice.paidMinor)
}

export function sum(rows: { amountMinor: number }[]): number {
  return rows.reduce((s, r) => s + r.amountMinor, 0)
}

function within(iso: string, from?: Date, to?: Date): boolean {
  const t = new Date(iso).getTime()
  if (from && t < from.getTime()) return false
  if (to && t > to.getTime()) return false
  return true
}

export function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

export function isSameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

/* ─── Report aggregations (Module 09 §62–63) ─────────────────────────────── */

export interface MethodTotal {
  key: PaymentMethod
  label: string
  amountMinor: number
}

/** Collections per payment method for the given range, zero rows omitted. */
export function collectionsByMethod(payments: Payment[], from?: Date, to?: Date): MethodTotal[] {
  return PAYMENT_METHODS.map((m) => ({
    key: m.key,
    label: m.label,
    amountMinor: payments
      .filter((p) => p.method === m.key && within(p.paymentDate, from, to))
      .reduce((s, p) => s + p.amountMinor, 0)
  })).filter((m) => m.amountMinor > 0)
}

/** Refunds per payment method for the range, zero rows omitted (ISSUED only). */
export function refundsByMethod(refunds: Refund[], from?: Date, to?: Date): MethodTotal[] {
  return PAYMENT_METHODS.map((m) => ({
    key: m.key,
    label: m.label,
    amountMinor: refunds
      .filter((r) => r.status === 'ISSUED' && r.method === m.key && within(r.refundDate, from, to))
      .reduce((s, r) => s + r.amountMinor, 0)
  })).filter((m) => m.amountMinor > 0)
}

export function inRange(iso: string, from?: Date, to?: Date): boolean {
  return within(iso, from, to)
}

/** Open + partially paid invoices (the receivables list). */
export function openInvoices(invoices: FinanceInvoice[]): FinanceInvoice[] {
  return invoices
    .filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_PAID')
    .sort((a, b) => invoiceDue(b) - invoiceDue(a))
}

/** Outstanding dues = sum owed across non-void invoices. */
export function outstandingDues(invoices: FinanceInvoice[]): number {
  return invoices.reduce((s, i) => s + invoiceDue(i), 0)
}

export interface RevenueRow {
  key: string
  label: string
  amountMinor: number
}

/** Billed revenue grouped by plan/line, largest first. */
export function revenueByPlan(invoices: FinanceInvoice[]): RevenueRow[] {
  const byPlan = new Map<string, number>()
  for (const i of invoices) {
    if (i.status === 'VOID') continue
    byPlan.set(i.line, (byPlan.get(i.line) ?? 0) + i.totalMinor)
  }
  return [...byPlan.entries()]
    .map(([label, amountMinor]) => ({ key: label, label, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
}

/** Recorded revenue grouped by the staff member who took the payment. */
export function revenueByStaff(payments: Payment[]): RevenueRow[] {
  const byStaff = new Map<string, number>()
  for (const p of payments)
    byStaff.set(p.createdBy, (byStaff.get(p.createdBy) ?? 0) + p.amountMinor)
  return [...byStaff.entries()]
    .map(([label, amountMinor]) => ({ key: label, label, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor)
}

export interface StatusBreakdown {
  status: InvoiceStatus
  count: number
  amountMinor: number
}

/** Invoice count + billed amount per status — feeds the receivables summary. */
export function invoiceStatusBreakdown(invoices: FinanceInvoice[]): StatusBreakdown[] {
  const statuses: InvoiceStatus[] = ['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID']
  return statuses.map((status) => {
    const rows = invoices.filter((i) => i.status === status)
    return {
      status,
      count: rows.length,
      amountMinor: rows.reduce((s, i) => s + i.totalMinor, 0)
    }
  })
}
