import type { Offer, OfferLifecycle } from './types'
import { formatMinor, type CurrencyCode } from '@/lib/money'

export interface DiscountLine {
  original: number
  discount: number
  final: number
  note: string
}

/**
 * Module 03 pricing math. The discount is computed against the plan's base price
 * and the result is snapshotted onto the Membership/Invoice at sale time. All
 * monetary values are integer minor units; `value` is minor for FIXED_AMOUNT /
 * OVERRIDE_PRICE and a whole unit (percent / months) otherwise.
 *
 * - PERCENTAGE    → base × value%
 * - FIXED_AMOUNT  → flat value off, never below zero
 * - OVERRIDE_PRICE→ the value replaces the price outright
 * - FREE_PERIOD   → value months are free on the NEXT billing cycle; this sale is
 *                   priced at base (the discount is deferred, not applied here)
 */
export function computeDiscountLine(
  offer: Offer,
  basePriceMinor: number,
  currency: CurrencyCode
): DiscountLine {
  const { discountType, value } = offer

  if (discountType === 'PERCENTAGE') {
    const discount = Math.round((basePriceMinor * value) / 100)
    return {
      original: basePriceMinor,
      discount,
      final: basePriceMinor - discount,
      note: `${value}% off`
    }
  }

  if (discountType === 'FIXED_AMOUNT') {
    const discount = Math.min(value, basePriceMinor)
    return {
      original: basePriceMinor,
      discount,
      final: basePriceMinor - discount,
      note: `${formatMinor(value, currency)} off`
    }
  }

  if (discountType === 'OVERRIDE_PRICE') {
    return {
      original: basePriceMinor,
      discount: basePriceMinor - value,
      final: value,
      note: `Flat ${formatMinor(value, currency)}`
    }
  }

  return {
    original: basePriceMinor,
    discount: 0,
    final: basePriceMinor,
    note: `${value} month${value === 1 ? '' : 's'} free on renewal`
  }
}

export function offerLifecycle(offer: Offer, now: Date = new Date()): OfferLifecycle {
  if (!offer.isActive) return 'PAUSED'
  if (offer.endDate && now > new Date(offer.endDate)) return 'ENDED'
  if (now < new Date(offer.startDate)) return 'UPCOMING'
  return 'LIVE'
}

export function offerIsLive(offer: Offer, now: Date = new Date()): boolean {
  return offerLifecycle(offer, now) === 'LIVE'
}

export function filterOffersByLifecycle(
  offers: Offer[],
  lifecycle: 'ALL' | 'LIVE' | 'UPCOMING' | 'ENDED' | 'PAUSED',
  now: Date = new Date()
): Offer[] {
  if (lifecycle === 'ALL') return offers
  return offers.filter((offer) => offerLifecycle(offer, now) === lifecycle)
}

export function discountBadgeText(
  offer: { discountType: Offer['discountType']; value: number },
  currency: CurrencyCode
): string {
  const { discountType, value } = offer
  if (discountType === 'PERCENTAGE') return `${value}%`
  if (discountType === 'FIXED_AMOUNT') return `−${formatMinor(value, currency)}`
  if (discountType === 'OVERRIDE_PRICE') return formatMinor(value, currency)
  return `${value}mo free`
}

export function validateOfferInput(offer: {
  name: string
  discountType: Offer['discountType']
  value: number
  minPurchase: number
  maxUses: number
  startDate: string
  endDate: string | null
}): string | null {
  if (!offer.name.trim()) return 'Offer needs a name'
  if (offer.endDate && offer.endDate <= offer.startDate) {
    return 'End date must be after the start date'
  }
  if (offer.minPurchase < 0) return 'Minimum purchase cannot be negative'
  if (offer.maxUses > 0 && offer.maxUses < 1) return 'Usage limit must be at least 1'

  const { discountType, value } = offer
  if (discountType === 'PERCENTAGE' && (value < 1 || value > 100)) {
    return 'Percentage must be between 1 and 100'
  }
  if (discountType === 'FIXED_AMOUNT' && value <= 0) {
    return 'Discount amount must be greater than zero'
  }
  if (discountType === 'OVERRIDE_PRICE' && value <= 0) {
    return 'Override price must be greater than zero'
  }
  if (discountType === 'FREE_PERIOD' && value <= 0) {
    return 'Free period must be at least 1 month'
  }
  return null
}
