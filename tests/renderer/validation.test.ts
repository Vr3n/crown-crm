import { describe, expect, it } from 'vitest'
import {
  emailError,
  isValidEmail,
  isValidIndianMobile,
  leadNameError,
  mobileError
} from '@/lib/validation'

describe('leadNameError', () => {
  it('requires a name', () => {
    expect(leadNameError('')).toBe('Name is required')
    expect(leadNameError('   ')).toBe('Name is required')
  })

  it('wants a real full name, not a single letter', () => {
    expect(leadNameError('R')).toBe('Enter the person\u2019s full name')
  })

  it('accepts a valid name and trims it', () => {
    expect(leadNameError('  Rahul Mehta  ')).toBeUndefined()
  })
})

describe('mobileError', () => {
  it('requires a number', () => {
    expect(mobileError('')).toBe('Mobile number is required')
    expect(mobileError('abc')).toBe('Mobile number is required')
  })

  it('guides the user until all 10 digits are present', () => {
    expect(mobileError('98')).toBe('Enter all 10 digits')
    expect(mobileError('98765012')).toBe('Enter all 10 digits')
  })

  it('flags a wrong starting digit immediately, not after the number is complete', () => {
    expect(mobileError('5')).toBe('Start with 6-9 (mobile) or 0/2 (landline)')
    expect(mobileError('5123456789')).toBe('Start with 6-9 (mobile) or 0/2 (landline)')
  })

  it('accepts a valid 10-digit mobile', () => {
    expect(mobileError('9876501234')).toBeUndefined()
  })

  it('accepts landline numbers starting with 0 or 2', () => {
    expect(mobileError('0221234567')).toBeUndefined()
    expect(mobileError('2212345678')).toBeUndefined()
  })

  it('matches the backend format including optional prefixes and landlines', () => {
    expect(isValidIndianMobile('9876501234')).toBe(true)
    expect(isValidIndianMobile('+91 98765 01234')).toBe(true)
    expect(isValidIndianMobile('0 9876501234')).toBe(true)
    expect(isValidIndianMobile('0221234567')).toBe(true)
    expect(isValidIndianMobile('2212345678')).toBe(true)
    expect(isValidIndianMobile('5123456789')).toBe(false)
    expect(isValidIndianMobile('1123456789')).toBe(false)
  })
})

describe('emailError', () => {
  it('uses the passed required message when empty', () => {
    expect(emailError('', 'Email is required')).toBe('Email is required')
  })

  it('guides through the @ first, then the shape', () => {
    expect(emailError('rahul.example.com', 'Email is required')).toBe('Email must contain an @')
    expect(emailError('rahul@example', 'Email is required')).toBe(
      'Enter a valid email like jane@example.com'
    )
  })

  it('accepts a valid email and normalizes whitespace', () => {
    expect(emailError('  rahul@example.com  ', 'Email is required')).toBeUndefined()
    expect(isValidEmail('rahul@example.com')).toBe(true)
    expect(isValidEmail('rahul@example')).toBe(false)
  })
})
