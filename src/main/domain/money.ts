/**
 * Integer money arithmetic.
 *
 * Money is paise. Percentages are basis points. Division rounds half away from
 * zero. No floating point value ever reaches a stored column.
 */

/** Divide two integers, rounding half away from zero. Denominator must be positive. */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error('Denominator must be positive')
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error('Money arithmetic requires safe integers')
  }
  const sign = numerator < 0 ? -1 : 1
  const absolute = Math.abs(numerator)
  return sign * Math.floor((absolute * 2 + denominator) / (2 * denominator))
}

/** A basis point share of an amount, in paise, rounded half away from zero. */
export function applyBps(amountMinor: number, bps: number): number {
  return roundHalfUpDiv(amountMinor * bps, 10_000)
}

/** Quantity is stored scaled by 10,000. Returns the unscaled value for display. */
export function qtyToDecimal(qtyE4: number): number {
  return qtyE4 / 10_000
}

/** Convert a decimal quantity to its stored form, rounding half away from zero. */
export function decimalToQty(value: number): number {
  return roundHalfUpDiv(Math.round(value * 10_000), 1)
}

/** Multiply a scaled quantity by a rate in paise, returning paise. */
export function lineGrossMinor(qtyE4: number, rateMinor: number): number {
  return roundHalfUpDiv(qtyE4 * rateMinor, 10_000)
}
