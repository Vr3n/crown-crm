import { describe, expect, it } from 'vitest'
import { setupTestDb } from '../../helpers/db'
import { setupCompany, updateCompany } from '../../../src/main/application/identity'
import { companyRepo } from '../../../src/main/repositories/identity'
import {
  MAX_COMPANY_LOGO_DATA_URL_LENGTH,
  updateCompanyInputSchema
} from '../../../src/shared/contracts/identity'

setupTestDb()

/** A real 1x1 PNG; the application layer only checks the data URL shape. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function company(): number {
  return setupCompany({
    name: 'Acme Distributors',
    ownerFullName: 'Owner',
    ownerEmail: 'owner@acme.in',
    ownerPassword: 'correct-horse',
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  }).companyId
}

describe('company logo', () => {
  it('stores a prepared data URL and keeps it across unrelated patches', () => {
    const companyId = company()
    expect(companyRepo.findById(companyId)?.logo).toBeNull()

    const saved = updateCompany({ logo: PNG })
    expect(saved.logo).toBe(PNG)
    expect(companyRepo.findById(companyId)?.logo).toBe(PNG)

    // The company editor does not send `logo`, so saving other fields must not
    // wipe the uploaded image.
    const renamed = updateCompany({ name: 'Acme Books' })
    expect(renamed.logo).toBe(PNG)
    expect(companyRepo.findById(companyId)?.logo).toBe(PNG)
  })

  it('rejects a data URL above the encoded-size cap', () => {
    company()
    const oversized = `data:image/png;base64,${'A'.repeat(MAX_COMPANY_LOGO_DATA_URL_LENGTH)}`
    expect(() => updateCompany({ logo: oversized })).toThrow(/too large/i)
  })

  it('rejects SVG and values that are not raster data URLs', () => {
    company()
    expect(() => updateCompany({ logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).toThrow(
      /PNG, JPEG or WebP/
    )
    expect(() => updateCompany({ logo: 'not-a-data-url' })).toThrow(/PNG, JPEG or WebP/)
    expect(() => updateCompany({ logo: 'https://example.com/logo.png' })).toThrow(
      /PNG, JPEG or WebP/
    )
  })

  it('clears the logo with an empty string or null', () => {
    const companyId = company()

    updateCompany({ logo: PNG })
    expect(updateCompany({ logo: '' }).logo).toBeNull()
    expect(companyRepo.findById(companyId)?.logo).toBeNull()

    updateCompany({ logo: PNG })
    expect(updateCompany({ logo: null }).logo).toBeNull()
    expect(companyRepo.findById(companyId)?.logo).toBeNull()
  })
})

describe('company logo boundary schema', () => {
  it('accepts PNG, JPEG and WebP data URLs', () => {
    for (const mime of ['png', 'jpeg', 'webp']) {
      const parsed = updateCompanyInputSchema.safeParse({
        logo: `data:image/${mime};base64,AAAA`
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('accepts an empty string or null so the logo can be removed', () => {
    expect(updateCompanyInputSchema.safeParse({ logo: '' }).success).toBe(true)
    expect(updateCompanyInputSchema.safeParse({ logo: null }).success).toBe(true)
  })

  it('rejects an oversized value at the boundary with a readable message', () => {
    const parsed = updateCompanyInputSchema.safeParse({
      logo: `data:image/png;base64,${'A'.repeat(MAX_COMPANY_LOGO_DATA_URL_LENGTH)}`
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toMatch(/too large/i)
  })

  it('rejects SVG and arbitrary strings at the boundary', () => {
    expect(
      updateCompanyInputSchema.safeParse({ logo: 'data:image/svg+xml;base64,AAAA' }).success
    ).toBe(false)
    expect(updateCompanyInputSchema.safeParse({ logo: 'logo.png' }).success).toBe(false)
  })
})
