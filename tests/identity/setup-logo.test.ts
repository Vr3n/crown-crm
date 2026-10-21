import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { setupTestDb } from '../helpers/db'
import { setupOrganization } from '../../src/main/application/identity'
import { organizationRepo } from '../../src/main/repositories/identity'
import { getOrgLogo } from '../../src/main/application/organization-logo'
import { configurePhotoStorage, getLogoPathSync } from '../../src/main/lib/photo-storage'
import { ValidationError } from '../../src/main/domain/errors'
import { setSession } from '../../src/main/auth/session'

setupTestDb()

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const VALID = {
  name: 'Logo Setup Gym',
  mobileNumber: '+919876543210',
  ownerFullName: 'Asha',
  ownerEmail: 'asha@example.com',
  ownerPassword: 'supersecret123'
}

beforeAll(() => {
  configurePhotoStorage(mkdtempSync(join(tmpdir(), 'crowncrm-setup-logo-')))
})

describe('setupOrganization with logo', () => {
  it('persists the logo file and filename atomically with setup', () => {
    const session = setupOrganization({
      ...VALID,
      logo: { filename: 'gym.png', data: TINY_PNG_B64 }
    })
    const filename = organizationRepo.findLogoFilename(session.organizationId)
    expect(filename).toMatch(/\.png$/)
    expect(existsSync(getLogoPathSync(session.organizationId, filename!))).toBe(true)

    const logo = getOrgLogo()
    expect(logo.logoFilename).toBe(filename)
    expect(logo.logoData).toBe(TINY_PNG_B64)
    expect(logo.mimeType).toBe('image/png')
  })

  it('reads the logo without org.view (sidebar shows it for every role)', () => {
    const session = setupOrganization({
      ...VALID,
      logo: { filename: 'gym.png', data: TINY_PNG_B64 }
    })
    setSession({ ...session, permissions: [], isSuper: false })
    const logo = getOrgLogo()
    expect(logo.logoData).toBe(TINY_PNG_B64)
  })

  it('setup without a logo still works and leaves no logo', () => {
    const session = setupOrganization(VALID)
    expect(organizationRepo.findLogoFilename(session.organizationId)).toBeNull()
  })

  it('rejects a disallowed file type', () => {
    expect(() =>
      setupOrganization({ ...VALID, logo: { filename: 'gym.svg', data: TINY_PNG_B64 } })
    ).toThrow(ValidationError)
  })

  it('rejects an oversize logo', () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 1).toString('base64')
    expect(() => setupOrganization({ ...VALID, logo: { filename: 'gym.png', data: big } })).toThrow(
      /5MB/
    )
  })
})
