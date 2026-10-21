import { describe, expect, it } from 'vitest'
import { formatMinor, parseToMinor, sanitizeMoneyInput } from '../../src/renderer/src/lib/money'

/**
 * Money presentation/parse rules shared by every capture form (Module 04 §34):
 * staff type decimal rupees; the domain stores integer paise.
 */
describe('parseToMinor', () => {
  it('converts whole rupees to paise', () => {
    expect(parseToMinor('19200', 'INR')).toBe(1_920_000)
  })

  it('rounds half-even excess fractional digits', () => {
    expect(parseToMinor('19.999', 'INR')).toBe(2_000) // 19.999 → 20.00
    expect(parseToMinor('19200.5', 'INR')).toBe(1_920_050)
    expect(parseToMinor('19200.05', 'INR')).toBe(1_920_005)
  })

  it('accepts Indian-style grouping separators and currency glyphs', () => {
    expect(parseToMinor('₹19,200.50', 'INR')).toBe(1_920_050)
    expect(parseToMinor(' 1200 ', 'INR')).toBe(120_000)
  })

  it('rejects non-numeric and negative input', () => {
    expect(parseToMinor('', 'INR')).toBeUndefined()
    expect(parseToMinor('abc', 'INR')).toBeUndefined()
    expect(parseToMinor('-5', 'INR')).toBeUndefined()
    expect(parseToMinor('1.2.3', 'INR')).toBeUndefined()
    expect(parseToMinor('12,34.5.6', 'INR')).toBeUndefined()
  })
})

describe('formatMinor', () => {
  it('formats stored paise back to rupees with up to 2 decimals', () => {
    expect(formatMinor(1_920_000, 'INR')).toMatch(/19,200/)
    expect(formatMinor(1_920_050, 'INR')).toMatch(/19,200\.5/)
    expect(formatMinor(0, 'INR')).toMatch(/0/)
  })
})

describe('sanitizeMoneyInput', () => {
  it('passes through plain digit strings', () => {
    expect(sanitizeMoneyInput('0')).toBe('0')
    expect(sanitizeMoneyInput('19200')).toBe('19200')
    expect(sanitizeMoneyInput('')).toBe('')
  })

  it('keeps a single decimal point and its fractional digits', () => {
    expect(sanitizeMoneyInput('19200.45')).toBe('19200.45')
    expect(sanitizeMoneyInput('0.5')).toBe('0.5')
    expect(sanitizeMoneyInput('.5')).toBe('.5')
  })

  it('allows a trailing decimal point so the user can keep typing', () => {
    expect(sanitizeMoneyInput('19200.')).toBe('19200.')
  })

  it('drops any non-digit, non-dot characters', () => {
    expect(sanitizeMoneyInput('₹1,9 2a00')).toBe('19200')
    expect(sanitizeMoneyInput('12e3')).toBe('123')
    expect(sanitizeMoneyInput('1-2+3')).toBe('123')
  })

  it('truncates the fractional part to at most two digits', () => {
    expect(sanitizeMoneyInput('19.999')).toBe('19.99')
    expect(sanitizeMoneyInput('1.2345')).toBe('1.23')
  })

  it('collapses repeated dots and keeps only the first', () => {
    expect(sanitizeMoneyInput('1.2.3')).toBe('1.23')
    expect(sanitizeMoneyInput('..5')).toBe('.5')
  })

  it('respects a custom max fraction digits argument', () => {
    expect(sanitizeMoneyInput('1.2345', 3)).toBe('1.234')
    expect(sanitizeMoneyInput('1.2345', 0)).toBe('1.')
  })

  it('produces a value that parseToMinor accepts for decimal input', () => {
    expect(parseToMinor(sanitizeMoneyInput('1000.456'), 'INR')).toBe(100_045) // 1000.45
  })
})
