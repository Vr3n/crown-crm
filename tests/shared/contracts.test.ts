import { describe, it, expect } from 'vitest'
import { ERROR_CODES, ApiError, isApiError } from '../../src/shared/contracts/errors'
import {
  setupOrganizationInputSchema,
  loginInputSchema,
  createStaffMemberInputSchema,
  organizationExistenceInputSchema
} from '../../src/shared/contracts/identity'
import { sellMembershipInputSchema } from '../../src/shared/contracts/membership-sale'

/**
 * Tests the canonical shared contracts (ADR-0006): the additive error-code
 * catalog, the ApiError the preload re-throws, and the Zod boundary schemas
 * that validate IPC input shape before it reaches the application layer.
 */
describe('error code catalog', () => {
  it('keeps every code value identical to its key', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key)
    }
  })

  it('has no duplicate values', () => {
    const values = Object.values(ERROR_CODES)
    expect(new Set(values).size).toBe(values.length)
  })

  it('includes the codes the renderer branches on', () => {
    expect(ERROR_CODES).toMatchObject({
      UNAUTHENTICATED: 'UNAUTHENTICATED',
      PERMISSION_DENIED: 'PERMISSION_DENIED',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      NOT_FOUND: 'NOT_FOUND',
      INTERNAL_ERROR: 'INTERNAL_ERROR'
    })
  })
})

describe('ApiError', () => {
  it('carries code, message, and optional details', () => {
    const err = new ApiError('NOT_FOUND', 'gone', { id: 7 })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ApiError')
    expect(err.code).toBe('NOT_FOUND')
    expect(err.message).toBe('gone')
    expect(err.details).toEqual({ id: 7 })
  })

  it('is narrowed by isApiError', () => {
    expect(isApiError(new ApiError('INTERNAL_ERROR', 'x'))).toBe(true)
    expect(isApiError(new Error('x'))).toBe(false)
    expect(isApiError({ code: 'NOT_FOUND', message: 'x' })).toBe(false)
    expect(isApiError(null)).toBe(false)
    expect(isApiError(undefined)).toBe(false)
  })
})

describe('boundary zod schemas', () => {
  it('accepts a valid setup payload with optional fields omitted', () => {
    const result = setupOrganizationInputSchema.safeParse({
      name: 'Fit Gym',
      ownerFullName: 'Ravi',
      ownerEmail: 'ravi@example.com',
      ownerPassword: 'secret123',
      mobileNumber: '9876543210'
    })
    expect(result.success).toBe(true)
  })

  it('rejects a setup payload missing required fields', () => {
    expect(setupOrganizationInputSchema.safeParse({ name: 'Fit Gym' }).success).toBe(false)
  })

  it('rejects a setup payload with an over-length name', () => {
    expect(
      setupOrganizationInputSchema.safeParse({
        name: 'x'.repeat(121),
        ownerFullName: 'R',
        ownerEmail: 'r@x.com',
        ownerPassword: 'p',
        mobileNumber: '1'
      }).success
    ).toBe(false)
  })

  it('validates login payloads', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })

  it('validates staff creation payloads', () => {
    expect(
      createStaffMemberInputSchema.safeParse({
        fullName: 'A',
        email: 'a@b.com',
        password: 'p',
        roleName: 'Manager'
      }).success
    ).toBe(true)
    expect(
      createStaffMemberInputSchema.safeParse({
        fullName: 'A',
        email: '',
        password: 'p',
        roleName: 'Manager'
      }).success
    ).toBe(false)
  })

  it('accepts a membership sale with an optional payment reference', () => {
    const base = {
      leadId: 1,
      planId: 2,
      offerId: null,
      joiningDate: '2026-08-25',
      startDate: '2026-08-25',
      endDate: '2026-11-22',
      issueDate: '2026-08-25',
      basePriceMinor: 150_000,
      discountType: 'NONE' as const,
      discountValueMinor: null,
      paidAmountMinor: 150_000,
      paymentMethod: 'CHEQUE' as const,
      transactionId: '00000000-0000-4000-8000-000000000001'
    }
    expect(sellMembershipInputSchema.safeParse(base).success).toBe(true)
    expect(sellMembershipInputSchema.safeParse({ ...base, reference: 'CHQ-0042' }).success).toBe(
      true
    )
    expect(sellMembershipInputSchema.safeParse({ ...base, reference: null }).success).toBe(true)
  })

  it('rejects a membership sale reference longer than 200 chars', () => {
    const base = {
      leadId: 1,
      planId: 2,
      offerId: null,
      joiningDate: '2026-08-25',
      startDate: '2026-08-25',
      endDate: '2026-11-22',
      issueDate: '2026-08-25',
      basePriceMinor: 150_000,
      discountType: 'NONE' as const,
      discountValueMinor: null,
      paidAmountMinor: 150_000,
      paymentMethod: 'CHEQUE' as const,
      transactionId: '00000000-0000-4000-8000-000000000001'
    }
    expect(
      sellMembershipInputSchema.safeParse({ ...base, reference: 'x'.repeat(201) }).success
    ).toBe(false)
  })

  it('validates organization existence payloads', () => {
    expect(
      organizationExistenceInputSchema.safeParse({
        name: 'Gym',
        ownerEmail: 'a@b.com',
        mobileNumber: '1'
      }).success
    ).toBe(true)
    expect(
      organizationExistenceInputSchema.safeParse({
        name: '',
        ownerEmail: 'a@b.com',
        mobileNumber: '1'
      }).success
    ).toBe(false)
  })
})
