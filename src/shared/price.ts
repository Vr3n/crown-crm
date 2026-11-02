/**
 * Price and tax arithmetic for item master prices.
 *
 * Everything here works in integer minor units (paise) and basis points. The
 * functions mirror `computeLineTax` in `src-tauri/src/vouchers/posting.rs`, so a
 * preview built by the renderer rounds exactly like the posted voucher.
 *
 * A price can be quoted either way:
 * - inclusive: the customer pays this number and tax is extracted from it;
 * - exclusive: tax is added on top of this number.
 */

export interface PriceSplit {
  /** The amount the person on the other side of the counter pays. */
  grossMinor: number
  /** The amount a tax rate is applied to. */
  taxableMinor: number
  /** GST component of the gross amount. */
  gstMinor: number
  /** Compensation cess component of the gross amount. */
  cessMinor: number
  /** GST + cess. */
  taxMinor: number
}

/** Divide two integers, rounding half away from zero. */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('Denominator must be positive')
  const sign = numerator < 0 ? -1 : 1
  return sign * Math.floor((Math.abs(numerator) * 2 + denominator) / (2 * denominator))
}

/** A basis-point share of an amount, in minor units. */
export function applyBps(amountMinor: number, bps: number): number {
  return roundHalfUpDiv(amountMinor * bps, 10_000)
}

/**
 * Split a tax-inclusive price into taxable value, GST and cess.
 *
 * `2500` at 18% gives `2118.64` taxable and `381.36` GST. The tax is whatever
 * is left after extracting the taxable value, so the parts always add back to
 * the typed price.
 */
export function splitInclusivePrice(
  priceMinor: number,
  gstRateBps: number,
  cessRateBps = 0
): PriceSplit {
  const grossMinor = Math.max(0, Math.trunc(priceMinor))
  const gstBps = Math.max(0, Math.trunc(gstRateBps))
  const cessBps = Math.max(0, Math.trunc(cessRateBps))
  const taxableMinor = roundHalfUpDiv(grossMinor * 10_000, 10_000 + gstBps + cessBps)
  const taxMinor = grossMinor - taxableMinor
  const cessMinor = applyBps(taxableMinor, cessBps)
  const gstMinor = taxMinor - cessMinor
  return { grossMinor, taxableMinor, gstMinor, cessMinor, taxMinor }
}

/**
 * Add GST and cess to a tax-exclusive price.
 *
 * `1750` at 18% gives `315` GST and a `2065` landed gross.
 */
export function grossFromExclusive(
  taxableMinor: number,
  gstRateBps: number,
  cessRateBps = 0
): PriceSplit {
  const taxableValue = Math.max(0, Math.trunc(taxableMinor))
  const gstMinor = applyBps(taxableValue, Math.max(0, Math.trunc(gstRateBps)))
  const cessMinor = applyBps(taxableValue, Math.max(0, Math.trunc(cessRateBps)))
  const taxMinor = gstMinor + cessMinor
  return {
    grossMinor: taxableValue + taxMinor,
    taxableMinor: taxableValue,
    gstMinor,
    cessMinor,
    taxMinor
  }
}

/**
 * Display the price in the way the item form explains it: the typed price, the
 * tax it contains or attracts, and the gross. Kept here so the form, list and
 * detail page use one wording.
 */
export function describePrice(
  split: PriceSplit,
  options: { includesTax: boolean; gstRateBps: number; cessRateBps?: number }
): string {
  const parts = [`Taxable ${formatAmount(split.taxableMinor)}`]
  parts.push(`GST ${formatRate(options.gstRateBps)} ${formatAmount(split.gstMinor)}`)
  if ((options.cessRateBps ?? 0) > 0) {
    parts.push(`Cess ${formatRate(options.cessRateBps ?? 0)} ${formatAmount(split.cessMinor)}`)
  }
  parts.push(`${options.includesTax ? 'Customer pays' : 'Gross'} ${formatAmount(split.grossMinor)}`)
  return parts.join(' · ')
}

/** Plain rupee amount, two decimals, no currency glyph. */
export function formatAmount(minor: number): string {
  return (minor / 100).toFixed(2)
}

/** Basis points as a percent, for example `1800` -> `18%`. */
export function formatRate(bps: number): string {
  return `${Math.round(bps) / 100}%`
}
