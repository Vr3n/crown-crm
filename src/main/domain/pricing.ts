import { ValidationError } from './errors'

/**
 * Pricing domain (Module 03 + 04). Pure, no I/O.
 * Frontend preview and backend transaction must converge on the same math.
 * Backend is authoritative.
 * Money is integer paise; rounding is half-up once per calculation.
 */

export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT' | 'OVERRIDE_PRICE'

export interface PricingInput {
  basePriceMinor: number
  discountType: DiscountType
  discountValueMinor: number | null
}

export interface PricingResult {
  discountMinor: number
  finalPriceMinor: number
}

/**
 * Calculates discount and final price.
 * - NONE: discount 0, final = base
 * - PERCENTAGE: discount = round(base * value / 100)  (value is 1..100 whole percent)
 * - FIXED_AMOUNT: discount = value (paise), clamped to base
 * - OVERRIDE_PRICE: discount = base - value (value is final price paise)
 */
export function calculateSalePricing(input: PricingInput): PricingResult {
  const { basePriceMinor, discountType, discountValueMinor } = input

  if (!Number.isInteger(basePriceMinor) || basePriceMinor < 0) {
    throw new ValidationError('Base price must be a non-negative integer paise')
  }

  if (discountType === 'NONE') {
    if (discountValueMinor !== null) {
      throw new ValidationError('discountValue must be null when discountType is NONE')
    }
    return { discountMinor: 0, finalPriceMinor: basePriceMinor }
  }

  if (discountValueMinor === null) {
    throw new ValidationError('discountValue is required when discountType is not NONE')
  }
  if (!Number.isInteger(discountValueMinor) || discountValueMinor < 0) {
    throw new ValidationError('Discount value must be a non-negative integer')
  }

  let discountMinor = 0

  switch (discountType) {
    case 'PERCENTAGE': {
      if (discountValueMinor < 1 || discountValueMinor > 100) {
        throw new ValidationError('Percentage must be between 1 and 100')
      }
      // half-up: Math.round
      discountMinor = Math.round((basePriceMinor * discountValueMinor) / 100)
      break
    }
    case 'FIXED_AMOUNT': {
      discountMinor = discountValueMinor
      break
    }
    case 'OVERRIDE_PRICE': {
      // discountValueMinor is final price
      if (discountValueMinor > basePriceMinor) {
        throw new ValidationError('Override price cannot exceed base price')
      }
      discountMinor = basePriceMinor - discountValueMinor
      break
    }
    default:
      throw new ValidationError(`Unsupported discount type: ${discountType}`)
  }

  if (discountMinor > basePriceMinor) {
    throw new ValidationError('Discount exceeds base price')
  }

  const finalPriceMinor = basePriceMinor - discountMinor
  return { discountMinor, finalPriceMinor }
}

export function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function daysBetweenInclusive(start: string, end: string): number {
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  if (!s || !e) throw new ValidationError('Invalid date')
  const diff = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1
  return diff
}
