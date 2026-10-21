import { describe, expect, it } from 'vitest'
import { calculateSalePricing, daysBetweenInclusive } from '../../src/main/domain/pricing'
import { ValidationError } from '../../src/main/domain/errors'

describe('membership sale pricing', () => {
  it('does not apply a discount for NONE', () => {
    expect(
      calculateSalePricing({
        basePriceMinor: 100_000,
        discountType: 'NONE',
        discountValueMinor: null
      })
    ).toEqual({ discountMinor: 0, finalPriceMinor: 100_000 })
  })

  it('rejects a value for NONE', () => {
    expect(() =>
      calculateSalePricing({ basePriceMinor: 100_000, discountType: 'NONE', discountValueMinor: 1 })
    ).toThrow(ValidationError)
  })

  it('rounds percentage discounts to the nearest paise', () => {
    expect(
      calculateSalePricing({
        basePriceMinor: 101,
        discountType: 'PERCENTAGE',
        discountValueMinor: 50
      })
    ).toEqual({ discountMinor: 51, finalPriceMinor: 50 })
  })

  it('rejects a fixed discount larger than the base price', () => {
    expect(() =>
      calculateSalePricing({
        basePriceMinor: 100,
        discountType: 'FIXED_AMOUNT',
        discountValueMinor: 101
      })
    ).toThrow('Discount exceeds base price')
  })

  it('treats override value as the final price', () => {
    expect(
      calculateSalePricing({
        basePriceMinor: 100_000,
        discountType: 'OVERRIDE_PRICE',
        discountValueMinor: 75_000
      })
    ).toEqual({ discountMinor: 25_000, finalPriceMinor: 75_000 })
  })

  it('calculates an inclusive date duration', () => {
    expect(daysBetweenInclusive('2026-08-25', '2026-11-22')).toBe(90)
  })

  it('rejects malformed dates', () => {
    expect(() => daysBetweenInclusive('2026-08-25', 'not-a-date')).toThrow(ValidationError)
  })
})
