import { applyBps, roundHalfUpDiv } from './money'

/**
 * GST line computation. One function, integer only, used by the preview and by
 * the posting engine so the two cannot disagree.
 */

export interface LineTaxInput {
  qtyE4: number
  rateMinor: number
  rateIncludesTax: boolean
  discountBps: number
  gstRateBps: number
  cessRateBps?: number
}

export interface LineTaxResult {
  grossMinor: number
  discountMinor: number
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  taxMinor: number
  totalMinor: number
}

export interface InvoiceTotals {
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  discountMinor: number
  roundOffMinor: number
  totalMinor: number
  totalQtyE4: number
}

export function computeLineTax(input: LineTaxInput, intraState: boolean): LineTaxResult {
  const gross = roundHalfUpDiv(input.qtyE4 * input.rateMinor, 10_000)
  const discount = applyBps(gross, input.discountBps)
  const net = gross - discount
  const cessRate = input.cessRateBps ?? 0

  let taxable: number
  let tax: number
  let cgst = 0
  let sgst = 0
  let igst = 0
  let cess = 0

  if (input.rateIncludesTax) {
    taxable = roundHalfUpDiv(net * 10_000, 10_000 + input.gstRateBps + cessRate)
    tax = net - taxable
    cess = applyBps(taxable, cessRate)
    const gst = tax - cess
    if (intraState) {
      cgst = Math.floor(gst / 2)
      sgst = gst - cgst
    } else {
      igst = gst
    }
  } else {
    taxable = net
    cess = applyBps(taxable, cessRate)
    if (intraState) {
      const half = Math.floor(input.gstRateBps / 2)
      cgst = applyBps(taxable, half)
      sgst = applyBps(taxable, input.gstRateBps - half)
    } else {
      igst = applyBps(taxable, input.gstRateBps)
    }
    tax = cgst + sgst + igst + cess
  }

  return {
    grossMinor: gross,
    discountMinor: discount,
    taxableMinor: taxable,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: igst,
    cessMinor: cess,
    taxMinor: tax,
    totalMinor: taxable + tax
  }
}

/** Sums computed lines and applies invoice level round off to the rupee. */
export function computeInvoiceTotals(
  lines: LineTaxResult[],
  roundOffMode: 'INVOICE' | 'LINE' | 'NONE',
  totalQtyE4 = 0
): InvoiceTotals {
  const taxable = sum(lines, 'taxableMinor')
  const cgst = sum(lines, 'cgstMinor')
  const sgst = sum(lines, 'sgstMinor')
  const igst = sum(lines, 'igstMinor')
  const cess = sum(lines, 'cessMinor')
  const discount = sum(lines, 'discountMinor')
  const preRound = taxable + cgst + sgst + igst + cess

  let total = preRound
  let roundOff = 0
  if (roundOffMode === 'INVOICE') {
    total = roundHalfUpDiv(preRound, 100) * 100
    roundOff = total - preRound
  }

  if (Math.abs(roundOff) > 100) {
    throw new Error('ROUND_OFF_TOO_LARGE')
  }

  return {
    taxableMinor: taxable,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: igst,
    cessMinor: cess,
    discountMinor: discount,
    roundOffMinor: roundOff,
    totalMinor: total,
    totalQtyE4
  }
}

function sum(lines: LineTaxResult[], key: keyof LineTaxResult): number {
  return lines.reduce((total, line) => total + line[key], 0)
}

/** Intra state when the supplier and the place of supply share a state code. */
export function isIntraState(supplierState: string | null, placeOfSupply: string | null): boolean {
  const supplier = (supplierState ?? '').trim()
  const place = (placeOfSupply ?? supplier).trim()
  return supplier !== '' && supplier === place
}
