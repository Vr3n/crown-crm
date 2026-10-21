import { describe, expect, it } from 'vitest'
import {
  deriveMembershipStatus,
  calculateProratedRefund,
  resolveCancellationEffectiveDate,
  isPendingCancellation
} from '../../src/main/domain/membership'

describe('calculateProratedRefund', () => {
  it('returns 0 when total days is 0', () => {
    const refund = calculateProratedRefund({ paidMinor: 100_000, usedDays: 10, totalDays: 0 })
    expect(refund).toBe(0)
  })

  it('calculates prorated refund for unused days', () => {
    const refund = calculateProratedRefund({ paidMinor: 300_000, usedDays: 10, totalDays: 30 })
    expect(refund).toBe(200_000)
  })

  it('returns 0 when all days are used', () => {
    const refund = calculateProratedRefund({ paidMinor: 300_000, usedDays: 30, totalDays: 30 })
    expect(refund).toBe(0)
  })

  it('returns full refund when no days used', () => {
    const refund = calculateProratedRefund({ paidMinor: 300_000, usedDays: 0, totalDays: 30 })
    expect(refund).toBe(300_000)
  })

  it('rounds to nearest paisa', () => {
    const refund = calculateProratedRefund({ paidMinor: 100_000, usedDays: 1, totalDays: 3 })
    expect(refund).toBe(66_667)
  })
})

describe('resolveCancellationEffectiveDate', () => {
  it('returns today for IMMEDIATE timing', () => {
    const result = resolveCancellationEffectiveDate('IMMEDIATE', null, '2026-12-31', '2026-09-08')
    expect(result).toBe('2026-09-08')
  })

  it('returns end date for END_OF_PERIOD timing', () => {
    const result = resolveCancellationEffectiveDate(
      'END_OF_PERIOD',
      null,
      '2026-12-31',
      '2026-09-08'
    )
    expect(result).toBe('2026-12-31')
  })

  it('returns today + noticeDays for NOTICE_DAYS timing', () => {
    const result = resolveCancellationEffectiveDate('NOTICE_DAYS', 15, '2026-12-31', '2026-09-08')
    expect(result).toBe('2026-09-23')
  })

  it('defaults notice to 14 days when noticeDays is null', () => {
    const result = resolveCancellationEffectiveDate('NOTICE_DAYS', null, '2026-12-31', '2026-09-08')
    expect(result).toBe('2026-09-22')
  })

  it('uses overrideDate when provided for NOTICE_DAYS', () => {
    const result = resolveCancellationEffectiveDate(
      'NOTICE_DAYS',
      15,
      '2026-12-31',
      '2026-09-08',
      '2026-10-01'
    )
    expect(result).toBe('2026-10-01')
  })

  it('caps overrideDate at the membership end date', () => {
    const result = resolveCancellationEffectiveDate(
      'NOTICE_DAYS',
      null,
      '2026-09-15',
      '2026-09-08',
      '2026-10-01'
    )
    expect(result).toBe('2026-09-15')
  })

  it('caps the default notice date at the membership end date', () => {
    const result = resolveCancellationEffectiveDate('NOTICE_DAYS', null, '2026-09-15', '2026-09-08')
    expect(result).toBe('2026-09-15')
  })

  it('ignores overrideDate for IMMEDIATE timing', () => {
    const result = resolveCancellationEffectiveDate(
      'IMMEDIATE',
      null,
      '2026-12-31',
      '2026-09-08',
      '2026-10-01'
    )
    expect(result).toBe('2026-09-08')
  })

  it('ignores overrideDate for END_OF_PERIOD timing', () => {
    const result = resolveCancellationEffectiveDate(
      'END_OF_PERIOD',
      null,
      '2026-12-31',
      '2026-09-08',
      '2026-10-01'
    )
    expect(result).toBe('2026-12-31')
  })
})

describe('isPendingCancellation', () => {
  it('returns true when cancellationRequestedAt and future effective date exist', () => {
    expect(isPendingCancellation('2026-09-01', '2026-12-31')).toBe(true)
  })

  it('returns false when cancellationEffectiveDate is in the past', () => {
    expect(isPendingCancellation('2026-01-01', '2026-01-01')).toBe(false)
  })

  it('returns false when cancellationRequestedAt is null', () => {
    expect(isPendingCancellation(null, '2026-12-31')).toBe(false)
  })

  it('returns false when cancellationEffectiveDate is null', () => {
    expect(isPendingCancellation('2026-09-01', null)).toBe(false)
  })
})

describe('deriveMembershipStatus with cancellation', () => {
  it('returns ACTIVE when future cancellation is pending', () => {
    const status = deriveMembershipStatus(
      '2026-08-01',
      '2026-12-31',
      '2026-09-08',
      false,
      '2026-12-31'
    )
    expect(status).toBe('ACTIVE')
  })

  it('returns CANCELLED when cancellation effective date is in the past', () => {
    const status = deriveMembershipStatus(
      '2026-08-01',
      '2026-12-31',
      '2026-09-08',
      false,
      '2026-08-01'
    )
    expect(status).toBe('CANCELLED')
  })
})
