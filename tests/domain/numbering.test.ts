import { describe, expect, it } from 'vitest'
import {
  formatVoucherNumber,
  nextSequenceValue,
  validateNumberingSetting
} from '../../src/main/domain/numbering'

describe('voucher number formatting', () => {
  it('pads the value and adds prefix and suffix', () => {
    expect(formatVoucherNumber('PUR/', 1, 4, '')).toBe('PUR/0001')
    expect(formatVoucherNumber('TP/2026-27/', 42, 5, '/A')).toBe('TP/2026-27/00042/A')
  })

  it('does not truncate a value wider than the padding', () => {
    expect(formatVoucherNumber('INV/', 123456, 4, '')).toBe('INV/123456')
  })
})

describe('next sequence value', () => {
  it('starts at the configured number on a fresh year', () => {
    expect(nextSequenceValue(0, 1)).toBe(1)
    expect(nextSequenceValue(0, 100)).toBe(100)
  })

  it('continues past the high water mark and never goes below the start', () => {
    expect(nextSequenceValue(9, 1)).toBe(10)
    expect(nextSequenceValue(3, 100)).toBe(100)
  })
})

describe('numbering setting validation', () => {
  const valid = {
    series: 'PUR',
    prefix: 'PUR/',
    suffix: '',
    padding: 4,
    startNumber: 1
  }

  it('accepts a normal setting', () => {
    expect(validateNumberingSetting(valid)).toBeUndefined()
  })

  it('rejects a series that is too short or starts with a digit', () => {
    expect(validateNumberingSetting({ ...valid, series: 'P' })).toMatch(/Series/)
    expect(validateNumberingSetting({ ...valid, series: '1PUR' })).toMatch(/Series/)
  })

  it('rejects unsafe prefix characters', () => {
    expect(validateNumberingSetting({ ...valid, prefix: 'PUR#/' })).toMatch(/Prefix/)
  })

  it('bounds the width and starting number', () => {
    expect(validateNumberingSetting({ ...valid, padding: 0 })).toMatch(/Width/)
    expect(validateNumberingSetting({ ...valid, padding: 9 })).toMatch(/Width/)
    expect(validateNumberingSetting({ ...valid, startNumber: 0 })).toMatch(/Starting/)
  })
})
