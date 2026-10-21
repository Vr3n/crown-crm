import { describe, it, expect } from 'vitest'
import {
  updateOrgLogoInputSchema,
  ORG_LOGO_MAX_BYTES
} from '../../src/shared/contracts/organization-logo'
import { logoFileError } from '../../src/renderer/src/features/identity/logo'

describe('organization logo contracts', () => {
  it('accepts a valid upload payload', () => {
    const r = updateOrgLogoInputSchema.safeParse({ filename: 'gym.png', data: 'aGVsbG8=' })
    expect(r.success).toBe(true)
  })

  it('rejects empty data', () => {
    const r = updateOrgLogoInputSchema.safeParse({ filename: 'gym.png', data: '' })
    expect(r.success).toBe(false)
  })

  it('caps uploads at 5MB', () => {
    expect(ORG_LOGO_MAX_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('logoFileError (renderer mirror)', () => {
  const file = (name: string, size: number): File => ({ name, size }) as File
  it('accepts jpg/png/webp within limit', () => {
    expect(logoFileError(file('gym.png', 100))).toBeUndefined()
    expect(logoFileError(file('gym.webp', ORG_LOGO_MAX_BYTES))).toBeUndefined()
  })
  it('rejects bad extensions', () => {
    expect(logoFileError(file('gym.svg', 100))).toMatch(/jpg/)
  })
  it('rejects oversize files', () => {
    expect(logoFileError(file('gym.png', ORG_LOGO_MAX_BYTES + 1))).toMatch(/5MB/)
  })
})
