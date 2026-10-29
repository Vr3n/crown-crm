import type { InvoiceDocument, InvoiceLine, InvoiceTaxSlab } from './contracts/invoice'

/**
 * Pure helpers for the printed invoice. No Intl, no Date parsing, no locale:
 * the same bytes must come out on every machine, and the unit tests must not
 * depend on the host's ICU data.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Indian digit grouping: 1234567 -> "12,34,567". */
export function groupIndian(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, '')
  if (clean.length <= 3) return clean
  const lastThree = clean.slice(-3)
  const rest = clean.slice(0, -3)
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`
}

/** 455000 -> "4,550.00" (always two decimals, no currency symbol). */
export function formatInvoiceAmount(minor: number): string {
  const safe = Number.isFinite(minor) ? Math.trunc(minor) : 0
  const sign = safe < 0 ? '-' : ''
  const absolute = Math.abs(safe)
  const whole = Math.floor(absolute / 100)
  const fraction = absolute % 100
  return `${sign}${groupIndian(String(whole))}.${String(fraction).padStart(2, '0')}`
}

/** 25000 -> "2.5"; 1 -> "0.0001". Quantities keep up to four decimals. */
export function formatInvoiceQty(qtyE4: number): string {
  const safe = Number.isFinite(qtyE4) ? Math.trunc(qtyE4) : 0
  const sign = safe < 0 ? '-' : ''
  const absolute = Math.abs(safe)
  const whole = Math.floor(absolute / 10_000)
  const fraction = String(absolute % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '')
  return `${sign}${groupIndian(String(whole))}${fraction ? `.${fraction}` : ''}`
}

/** 1800 -> "18%", 250 -> "2.5%", 0 -> "0%". */
export function formatInvoicePercent(bps: number): string {
  const safe = Number.isFinite(bps) ? Math.trunc(bps) : 0
  const whole = Math.trunc(safe / 100)
  const fraction = String(Math.abs(safe % 100))
    .padStart(2, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}%` : `${whole}%`
}

/** "2026-10-29" -> "29 Oct 2026". Unknown input is returned unchanged. */
export function formatInvoiceDate(iso: string | null | undefined): string {
  const value = (iso ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return value
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return value
  return `${match[3]} ${month} ${match[1]}`
}

/**
 * Groups invoice lines by GST rate for the rate-wise tax analysis. Lines with
 * no rate and no value (for example a free-text service line) are dropped so
 * the table never shows an empty 0% row.
 */
export function buildTaxSlabs(lines: InvoiceLine[]): InvoiceTaxSlab[] {
  const byRate = new Map<number, InvoiceTaxSlab>()

  for (const line of lines) {
    const rate = line.gstRateBps
    const existing = byRate.get(rate) ?? {
      gstRateBps: rate,
      taxableMinor: 0,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      cessMinor: 0,
      taxMinor: 0
    }
    existing.taxableMinor += line.taxableMinor
    existing.cgstMinor += line.cgstMinor
    existing.sgstMinor += line.sgstMinor
    existing.igstMinor += line.igstMinor
    existing.cessMinor += line.cessMinor
    existing.taxMinor += line.cgstMinor + line.sgstMinor + line.igstMinor + line.cessMinor
    byRate.set(rate, existing)
  }

  return [...byRate.values()]
    .filter((slab) => slab.taxableMinor !== 0 || slab.taxMinor !== 0)
    .sort((a, b) => a.gstRateBps - b.gstRateBps)
}

export function invoiceDocumentTitle(type: InvoiceDocument['type']): string {
  return type === 'SALES' ? 'TAX INVOICE' : 'PURCHASE BILL'
}

export function invoicePartyLabel(type: InvoiceDocument['type']): string {
  return type === 'SALES' ? 'Bill To' : 'Supplier'
}

export function invoiceNumberLabel(type: InvoiceDocument['type']): string {
  return type === 'SALES' ? 'Invoice No.' : 'Supplier Bill No.'
}

/** True when any line was taxed as IGST, so the grid shows one IGST column. */
export function isInterStateInvoice(document: InvoiceDocument): boolean {
  return document.lines.some((line) => line.igstMinor !== 0)
}

/** Splits the stored terms into readable lines, dropping blank ones. */
export function invoiceTermLines(terms: string | null): string[] {
  return (terms ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
}
