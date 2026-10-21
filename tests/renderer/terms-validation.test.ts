import { describe, it, expect } from 'vitest'
import { termsError, ORG_TERMS_MAX_LENGTH } from '../../src/renderer/src/features/identity/validation'

describe('termsError (#111)', () => {
  it('accepts plain text terms', () => {
    expect(termsError('All dues must be cleared before renewal.')).toBeUndefined()
  })

  it('accepts multi-line plain text', () => {
    expect(termsError('Line one\nLine two')).toBeUndefined()
  })

  it('accepts an empty or whitespace-only string', () => {
    expect(termsError('')).toBeUndefined()
    expect(termsError('   ')).toBeUndefined()
  })

  it('rejects raw HTML', () => {
    expect(termsError('No <b>bold</b>')).toMatch(/HTML/)
    expect(termsError('<script>alert(1)</script>')).toMatch(/HTML/)
  })

  it('rejects text beyond the 2000-character boundary', () => {
    expect(termsError('x'.repeat(2001))).toMatch(/2000/)
    expect(termsError('x'.repeat(ORG_TERMS_MAX_LENGTH))).toBeUndefined()
  })
})