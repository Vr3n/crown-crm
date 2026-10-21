import { describe, it, expect } from 'vitest'
import { IndianMobileNumber, IndianPhoneNumber } from '../../src/main/domain/phone'
import { ValidationError } from '../../src/main/domain/errors'

describe('IndianMobileNumber.parse', () => {
  it('accepts a bare 10-digit mobile number and normalizes to 10 digits', () => {
    expect(IndianMobileNumber.parse('9876543210').value).toBe('9876543210')
  })

  it('accepts a +91 prefix and stores the bare 10 digits', () => {
    expect(IndianMobileNumber.parse('+919876543210').value).toBe('9876543210')
  })

  it('accepts a bare 91 prefix', () => {
    expect(IndianMobileNumber.parse('919876543210').value).toBe('9876543210')
  })

  it('accepts a 0091 prefix', () => {
    expect(IndianMobileNumber.parse('00919876543210').value).toBe('9876543210')
  })

  it('accepts a leading 0 prefix', () => {
    expect(IndianMobileNumber.parse('09876543210').value).toBe('9876543210')
  })

  it('accepts numbers starting with 6, 7, 8, or 9', () => {
    for (const first of ['6', '7', '8', '9']) {
      const number = `${first}000000000`
      expect(IndianMobileNumber.parse(number).value).toBe(number)
    }
  })

  it('accepts formatting separators (spaces, hyphens, parentheses)', () => {
    expect(IndianMobileNumber.parse('+91 98765 43210').value).toBe('9876543210')
    expect(IndianMobileNumber.parse('98765-43210').value).toBe('9876543210')
    expect(IndianMobileNumber.parse('(987) 654-3210').value).toBe('9876543210')
  })

  it('trims surrounding whitespace', () => {
    expect(IndianMobileNumber.parse('  9876543210  ').value).toBe('9876543210')
  })

  it('throws on a blank value', () => {
    expect(() => IndianMobileNumber.parse('')).toThrow(ValidationError)
    expect(() => IndianMobileNumber.parse('   ')).toThrow(ValidationError)
  })

  it('rejects a number whose first digit is 1, 3, 4, or 5 (unallocated series)', () => {
    for (const first of ['1', '3', '4', '5']) {
      expect(() => IndianMobileNumber.parse(`${first}000000000`)).toThrow(ValidationError)
    }
  })

  it('rejects numbers that are too short or too long', () => {
    expect(() => IndianMobileNumber.parse('987654321')).toThrow(ValidationError)
    expect(() => IndianMobileNumber.parse('98765432101')).toThrow(ValidationError)
  })

  it('rejects non-digit characters', () => {
    expect(() => IndianMobileNumber.parse('98765a4321')).toThrow(ValidationError)
  })

  it('rejects a non-Indian country code', () => {
    expect(() => IndianMobileNumber.parse('+19876543210')).toThrow(ValidationError)
  })

  it('accepts an STD-prefixed landline and keeps the leading zero', () => {
    expect(IndianMobileNumber.parse('0221234567').value).toBe('0221234567')
    expect(IndianMobileNumber.parse('01112345678').value).toBe('01112345678')
  })

  it('accepts a 10-digit landline starting with 2', () => {
    expect(IndianMobileNumber.parse('2212345678').value).toBe('2212345678')
  })
})

describe('IndianPhoneNumber.parse', () => {
  it('normalizes mobiles to bare 10 digits and keeps landlines as entered', () => {
    expect(IndianPhoneNumber.parse('+91 98765 43210').value).toBe('9876543210')
    expect(IndianPhoneNumber.parse('0221234567').value).toBe('0221234567')
    expect(IndianPhoneNumber.parse('2212345678').value).toBe('2212345678')
  })
})

describe('IndianMobileNumber.tryParse', () => {
  it('returns the value object for valid input and null otherwise', () => {
    expect(IndianMobileNumber.tryParse('+919876543210')?.value).toBe('9876543210')
    expect(IndianMobileNumber.tryParse('5123456789')).toBeNull()
    expect(IndianMobileNumber.tryParse('')).toBeNull()
  })
})

describe('IndianMobileNumber.toString', () => {
  it('returns the normalized 10-digit value', () => {
    expect(String(IndianMobileNumber.parse('+91 98765 43210'))).toBe('9876543210')
  })
})
