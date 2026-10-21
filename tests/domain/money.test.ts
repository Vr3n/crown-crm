import { describe, it, expect } from 'vitest'
import {
  applyBps,
  decimalToQty,
  lineGrossMinor,
  qtyToDecimal,
  roundHalfUpDiv
} from '../../src/main/domain/money'

describe('roundHalfUpDiv', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfUpDiv(5, 2)).toBe(3)
    expect(roundHalfUpDiv(4, 2)).toBe(2)
    expect(roundHalfUpDiv(-5, 2)).toBe(-3)
    expect(roundHalfUpDiv(1, 3)).toBe(0)
    expect(roundHalfUpDiv(2, 3)).toBe(1)
    expect(roundHalfUpDiv(0, 7)).toBe(0)
  })

  it('rejects a non positive denominator', () => {
    expect(() => roundHalfUpDiv(1, 0)).toThrow()
  })
})

describe('applyBps', () => {
  it('computes 18 percent of a taxable value in paise', () => {
    // 13,173.33 at 18% = 2,371.1994 -> 2,371.20
    expect(applyBps(1_317_333, 1800)).toBe(237_120)
  })

  it('computes 9 percent of a sale line', () => {
    // 3,855.93 at 9% = 347.0337 -> 347.03
    expect(applyBps(385_593, 900)).toBe(34_703)
  })

  it('returns zero for a zero rate', () => {
    expect(applyBps(123_456, 0)).toBe(0)
  })
})

describe('quantity and line gross', () => {
  it('multiplies a scaled quantity by a rate', () => {
    expect(lineGrossMinor(10_000, 385_593)).toBe(385_593)
    expect(lineGrossMinor(20_000, 45_000)).toBe(90_000)
    expect(lineGrossMinor(15_000, 10_000)).toBe(15_000)
  })

  it('rounds fractional quantities half up', () => {
    expect(qtyToDecimal(12_500)).toBe(1.25)
    expect(decimalToQty(1.25)).toBe(12_500)
    expect(decimalToQty(0.33335)).toBe(3334)
  })
})
