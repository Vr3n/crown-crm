import { describe, expect, it } from 'vitest'
import {
  blankPartyForm,
  partyFieldError,
  partyFormSchema,
  partyFormToInput,
  toMinor
} from '@/features/parties/party-form'

describe('party form rules', () => {
  it('rejects an empty name', () => {
    expect(partyFieldError('name', '')).toBe('Party name is required')
    expect(partyFieldError('name', '   ')).toBe('Party name is required')
  })

  it('accepts a normal name', () => {
    expect(partyFieldError('name', 'Sharma Traders')).toBeUndefined()
  })

  it('validates email only when one is typed', () => {
    expect(partyFieldError('email', '')).toBeUndefined()
    expect(partyFieldError('email', 'not-an-email')).toBe('Enter a valid email')
    expect(partyFieldError('email', 'books@example.com')).toBeUndefined()
  })

  it('requires a 15 character GSTIN when present', () => {
    expect(partyFieldError('gstin', '')).toBeUndefined()
    expect(partyFieldError('gstin', '27AABFU4477G1Z')).toBe('GSTIN is 15 characters')
    expect(partyFieldError('gstin', '27AABFU4477G1ZY')).toBeUndefined()
  })

  it('accepts a two digit state code only', () => {
    expect(partyFieldError('stateCode', '')).toBeUndefined()
    expect(partyFieldError('stateCode', '7')).toBe('Two digits, e.g. 27')
    expect(partyFieldError('stateCode', '27')).toBeUndefined()
  })

  it('keeps credit days between 0 and 365', () => {
    expect(partyFieldError('creditDays', '-1')).toBe('Enter 0 to 365 days')
    expect(partyFieldError('creditDays', '366')).toBe('Enter 0 to 365 days')
    expect(partyFieldError('creditDays', '30')).toBeUndefined()
  })

  it('rejects a negative credit limit or opening balance', () => {
    expect(partyFieldError('creditLimit', '-10')).toBe('Cannot be negative')
    expect(partyFieldError('creditLimit', '1000')).toBeUndefined()
    expect(partyFieldError('openingBalance', 'abc')).toBe('Enter an amount')
  })

  it('requires at least one role', () => {
    const result = partyFormSchema.safeParse({
      ...blankPartyForm(),
      name: 'Sharma Traders',
      isCustomer: false,
      isSupplier: false
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Choose customer, supplier, or both')
      expect(result.error.issues[0]?.path).toEqual(['isCustomer'])
    }
  })

  it('passes a complete form', () => {
    const result = partyFormSchema.safeParse({
      ...blankPartyForm(),
      name: 'Sharma Traders',
      email: 'books@example.com',
      gstin: '27AABFU4477G1ZY',
      stateCode: '27',
      creditDays: '30',
      creditLimit: '50000'
    })
    expect(result.success).toBe(true)
  })
})

describe('party payload', () => {
  it('converts rupees to paise and blanks to null', () => {
    const input = partyFormToInput({
      ...blankPartyForm(),
      name: '  Sharma Traders  ',
      email: ' BOOKS@EXAMPLE.COM ',
      gstin: ' 27aabfu4477g1zy ',
      stateCode: '27',
      creditDays: '30',
      creditLimit: '1,234.56',
      openingBalance: '-500.25',
      openingDate: '2026-04-01'
    })

    expect(input.name).toBe('Sharma Traders')
    expect(input.email).toBe('books@example.com')
    expect(input.gstin).toBe('27AABFU4477G1ZY')
    expect(input.creditLimitMinor).toBe(123456)
    expect(input.openingBalanceMinor).toBe(-50025)
    expect(input.openingBalanceDate).toBe('2026-04-01')
    expect(input.phone).toBeNull()
  })

  it('treats blank money as zero', () => {
    expect(toMinor('')).toBe(0)
    expect(toMinor('₹1,000')).toBe(100000)
    expect(toMinor('.')).toBe(0)
  })
})
