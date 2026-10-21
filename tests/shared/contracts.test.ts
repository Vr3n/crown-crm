import { describe, it, expect } from 'vitest'
import {
  setupCompanyInputSchema,
  updateCompanyInputSchema
} from '../../src/shared/contracts/identity'
import { formatMinor } from '../../src/shared/contracts/money'

describe('company contracts', () => {
  it('defaults the state code and accepts a minimal setup payload', () => {
    const parsed = setupCompanyInputSchema.parse({
      name: 'Acme',
      ownerFullName: 'Owner',
      ownerEmail: 'owner@acme.in',
      ownerPassword: 'long-enough'
    })
    expect(parsed.stateCode).toBe('27')
    expect(parsed.currency).toBeUndefined()
  })

  it('rejects a one digit state code', () => {
    const result = setupCompanyInputSchema.safeParse({
      name: 'Acme',
      ownerFullName: 'Owner',
      ownerEmail: 'owner@acme.in',
      ownerPassword: 'long-enough',
      stateCode: '7'
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid financial year month and costing method', () => {
    expect(updateCompanyInputSchema.safeParse({ fyStartMonth: 13 }).success).toBe(false)
    expect(updateCompanyInputSchema.safeParse({ costingMethod: 'LIFO' }).success).toBe(false)
    expect(updateCompanyInputSchema.safeParse({ costingMethod: 'WEIGHTED_AVERAGE' }).success).toBe(
      true
    )
  })
})

describe('money formatting', () => {
  it('formats paise with Indian grouping', () => {
    const formatted = formatMinor(1_554_500, 'INR')
    expect(formatted).toContain('15,545.00')
  })
})
