import { describe, expect, it } from 'vitest'
import { amountInWords } from '../../src/shared/amount-in-words'

describe('amountInWords', () => {
  it('writes zero with the currency word', () => {
    expect(amountInWords(0)).toBe('Rupees Zero Only')
  })

  it('uses the Indian thousand / lakh / crore scales', () => {
    expect(amountInWords(450_000)).toBe('Rupees Four Thousand Five Hundred Only')
    expect(amountInWords(1_000_000_000)).toBe('Rupees One Crore Only')
    expect(amountInWords(12_345_678)).toBe(
      'Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only'
    )
  })

  it('writes paise only when the fraction is not zero', () => {
    expect(amountInWords(237_118)).toBe(
      'Rupees Two Thousand Three Hundred Seventy One and Eighteen Paise Only'
    )
    expect(amountInWords(237_100)).toBe('Rupees Two Thousand Three Hundred Seventy One Only')
  })

  it('handles negatives and other currencies', () => {
    expect(amountInWords(-450_000)).toBe('Minus Rupees Four Thousand Five Hundred Only')
    expect(amountInWords(123_456, 'USD')).toBe(
      'Dollars One Thousand Two Hundred Thirty Four and Fifty Six Cents Only'
    )
  })

  it('never trusts a non-finite input', () => {
    expect(amountInWords(Number.NaN)).toBe('Rupees Zero Only')
    expect(amountInWords(Number.POSITIVE_INFINITY)).toBe('Rupees Zero Only')
  })
})
