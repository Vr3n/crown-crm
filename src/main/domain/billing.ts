/**
 * Billing & Invoicing domain (Module 04).
 *
 * Billing determines what the customer *owes*; Membership determines what they're
 * *entitled to*. A finalized invoice is immutable; a DRAFT gives the front desk a
 * live total before the numbers freeze.
 */

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE'

export interface Invoice {
  id: number
  organizationId: number
  number: string
  customerId: number
  status: InvoiceStatus
  billingName: string | null
  billingPhone: string | null
  billingEmail: string | null
  billingAddress: string | null
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  finalizedAt: string | null
  finalizedBy: number | null
  voidedAt: string | null
  voidedBy: number | null
  voidReason: string | null
  createdAt: string
  createdBy: number
}

export interface InvoiceLine {
  id: number
  organizationId: number
  invoiceId: number
  description: string
  quantity: number
  unitPriceMinor: number
  discountMinor: number
  taxRateBps: number
  taxAmountMinor: number
  lineTotalMinor: number
  planId: number | null
  offerId: number | null
  sortOrder: number
}

export interface InvoiceSequence {
  id: number
  organizationId: number
  year: string
  prefix: string
  lastValue: number
}

/**
 * Invoice state machine (Module 11 §72, Module 04 §13).
 *
 * DRAFT → OPEN (finalize)
 * OPEN → PARTIALLY_PAID (payment)
 * PARTIALLY_PAID → PAID (payment)
 * OPEN → VOID (explicit)
 * OPEN → UNCOLLECTIBLE (explicit)
 */
const ALLOWED_INVOICE_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['OPEN'],
  OPEN: ['PARTIALLY_PAID', 'PAID', 'VOID', 'UNCOLLECTIBLE'],
  PARTIALLY_PAID: ['PAID', 'VOID', 'UNCOLLECTIBLE'],
  PAID: [],
  VOID: [],
  UNCOLLECTIBLE: []
}

export function assertValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  const allowed = ALLOWED_INVOICE_TRANSITIONS[from]
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Invalid invoice transition: ${from} → ${to}`)
  }
}

/**
 * InvoiceCalculationService — pure tax math (Module 04 §35).
 *
 * Tax rounding: line tax computed once at creation, half-up, integer paise;
 * totals are the sum of line values (no float drift — Scenario 3/8 regression test).
 */
export const InvoiceCalculationService = {
  /**
   * Calculates the tax amount for a single line using half-up rounding.
   * Formula: line_tax = floor((quantity * unit_price * tax_rate_bps) / 10000 + 0.5)
   * This is equivalent to rounding to nearest integer (half-up).
   */
  calculateLineTax(
    unitPriceMinor: number,
    quantity: number,
    taxRateBps: number
  ): { taxAmountMinor: number; lineTotalMinor: number } {
    const netAmount = unitPriceMinor * quantity
    // Half-up rounding: add 0.5 before truncating
    const taxAmountMinor = Math.floor((netAmount * taxRateBps) / 10000 + 0.5)
    const lineTotalMinor = netAmount + taxAmountMinor
    return { taxAmountMinor, lineTotalMinor }
  },

  /**
   * Calculates draft invoice totals from line values.
   * Sums are the authoritative source — never recompute from line math after finalize.
   */
  calculateDraftTotals(
    lines: Array<{
      unitPriceMinor: number
      quantity: number
      discountMinor: number
      taxAmountMinor: number
      lineTotalMinor: number
    }>
  ): { subtotalMinor: number; taxMinor: number; totalMinor: number } {
    let subtotalMinor = 0
    let taxMinor = 0
    let totalMinor = 0

    for (const line of lines) {
      const netAmount = line.unitPriceMinor * line.quantity - line.discountMinor
      subtotalMinor += netAmount
      taxMinor += line.taxAmountMinor
      totalMinor += line.lineTotalMinor
    }

    return { subtotalMinor, taxMinor, totalMinor }
  }
}

/**
 * Derives a short uppercase invoice prefix from the organization name.
 * Uses the first letter of each word (max 3 chars), e.g. "Crown Vitality" → "CRO".
 * An explicit prefix (from `organizations.org_invoice_prefix`) takes precedence.
 */
export function deriveInvoicePrefix(orgName: string, explicit?: string | null): string {
  if (explicit && explicit.trim().length > 0) return explicit.trim().toUpperCase().slice(0, 6)
  return (
    orgName
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase())
      .join('')
      .slice(0, 3) || 'ORG'
  )
}

/**
 * Formats a date as DDMMYY for the invoice sequence key.
 * e.g. 2026-09-01 → "010926"
 */
export function formatDDMMYY(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getDate())}${pad(date.getMonth() + 1)}${String(date.getFullYear()).slice(-2)}`
}
