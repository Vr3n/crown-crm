import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/main/auth/password'

describe('hashPassword', () => {
  it('produces a salt:hash pair', () => {
    const stored = hashPassword('supersecret')
    expect(stored).toContain(':')
    expect(stored.split(':')).toHaveLength(2)
  })

  it('is salted — the same password yields different stored values', () => {
    const a = hashPassword('supersecret')
    const b = hashPassword('supersecret')
    expect(a).not.toBe(b)
  })
})

describe('verifyPassword', () => {
  it('returns true for the correct password', () => {
    const stored = hashPassword('correct horse battery staple')
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('returns false for a wrong password', () => {
    const stored = hashPassword('correct')
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('returns false for a correct password of a different length (no timing leak)', () => {
    const stored = hashPassword('a much longer secret phrase')
    expect(verifyPassword('short', stored)).toBe(false)
  })

  it('handles malformed stored hashes without crashing', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', 'saltonly:')).toBe(false)
    expect(verifyPassword('x', ':hashonly')).toBe(false)
  })
})
