import { describe, it, expect } from 'vitest'
import { setupTestDb } from '../helpers/db'
import { setupOrganization, checkOrganizationExists } from '../../src/main/application/identity'

setupTestDb()

const VALID = {
  name: 'Example Gym Aurangabad',
  mobileNumber: '+919876543210',
  ownerFullName: 'Neha',
  ownerEmail: 'Neha@Example.com',
  ownerPassword: 'supersecret123'
}

describe('checkOrganizationExists', () => {
  it('returns false before any organization exists', () => {
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: VALID.ownerEmail,
        mobileNumber: '9876543210'
      })
    ).toBe(false)
  })

  it('returns true when the name matches AND the owner email matches', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: VALID.ownerEmail,
        mobileNumber: '9999999999'
      })
    ).toBe(true)
  })

  it('returns true when the name matches AND the mobile matches', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: 'nobody@example.com',
        mobileNumber: VALID.mobileNumber
      })
    ).toBe(true)
  })

  it('returns false when only the name matches (neither email nor mobile)', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: 'nobody@example.com',
        mobileNumber: '9999999999'
      })
    ).toBe(false)
  })

  it('returns false for a different name', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: 'Some Other Gym',
        ownerEmail: VALID.ownerEmail,
        mobileNumber: VALID.mobileNumber
      })
    ).toBe(false)
  })

  it('matches the owner email case-insensitively', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: 'neha@example.com',
        mobileNumber: '9999999999'
      })
    ).toBe(true)
  })

  it('does not count a non-owner staff email as the owner credential', () => {
    setupOrganization(VALID)
    expect(
      checkOrganizationExists({
        name: VALID.name,
        ownerEmail: 'manager@example.com',
        mobileNumber: '9999999999'
      })
    ).toBe(false)
  })
})
