import { describe, it, expect } from 'vitest'
import {
  BUSINESS_DATE_REGEX,
  DEFAULT_TIMEZONE,
  assertValidBusinessDate,
  businessDateToUtc,
  excelDateForDateOnly,
  excelDateForInstant,
  isValidTimezone,
  parseStoredInstant,
  resolveTimezone,
  todayInOrgTz
} from '../../src/main/domain/dates'

describe('dates domain primitives (#110)', () => {
  describe('assertValidBusinessDate', () => {
    it('accepts well-formed dates', () => {
      expect(() => assertValidBusinessDate('2026-10-12')).not.toThrow()
      expect(BUSINESS_DATE_REGEX.test('2026-10-12')).toBe(true)
    })

    it('rejects wrong shapes', () => {
      expect(() => assertValidBusinessDate('12-10-2026')).toThrow()
      expect(() => assertValidBusinessDate('2026-10-12T00:00:00')).toThrow()
      expect(() => assertValidBusinessDate('')).toThrow()
    })

    it('rejects impossible calendar dates', () => {
      expect(() => assertValidBusinessDate('2026-02-30')).toThrow()
      expect(() => assertValidBusinessDate('2026-13-01')).toThrow()
      expect(() => assertValidBusinessDate('2026-00-10')).toThrow()
    })

    it('accepts leap days', () => {
      expect(() => assertValidBusinessDate('2024-02-29')).not.toThrow()
      expect(() => assertValidBusinessDate('2023-02-29')).toThrow()
    })
  })

  describe('resolveTimezone', () => {
    it('passes valid IANA zones through', () => {
      expect(isValidTimezone('Asia/Kolkata')).toBe(true)
      expect(isValidTimezone('America/New_York')).toBe(true)
      expect(isValidTimezone('whatever')).toBe(false)
      expect(isValidTimezone('')).toBe(false)
    })

    it('falls back for missing/invalid zones', () => {
      expect(resolveTimezone(null)).toBe(DEFAULT_TIMEZONE)
      expect(resolveTimezone(undefined)).toBe(DEFAULT_TIMEZONE)
      expect(resolveTimezone('')).toBe(DEFAULT_TIMEZONE)
      expect(resolveTimezone('whatever')).toBe(DEFAULT_TIMEZONE)
    })
  })

  describe('businessDateToUtc', () => {
    it('anchors Kolkata noon at 06:30Z (no day flip)', () => {
      // 12:00 +05:30 → 06:30Z, same calendar day.
      expect(businessDateToUtc('2026-10-12', 'Asia/Kolkata')).toBe('2026-10-12T06:30:00.000Z')
    })

    it('handles a DST zone (New York summer, UTC-4)', () => {
      // 12:00 -04:00 → 16:00Z, same calendar day.
      expect(businessDateToUtc('2026-08-10', 'America/New_York')).toBe('2026-08-10T16:00:00.000Z')
    })

    it('handles a DST zone (New York winter, UTC-5)', () => {
      expect(businessDateToUtc('2026-01-10', 'America/New_York')).toBe('2026-01-10T17:00:00.000Z')
    })
  })

  describe('todayInOrgTz', () => {
    it('derives the wall date in the given zone', () => {
      // 2026-10-11 20:00Z is 2026-10-12 01:30 in Kolkata.
      expect(todayInOrgTz('Asia/Kolkata', new Date('2026-10-11T20:00:00.000Z'))).toBe('2026-10-12')
      expect(todayInOrgTz('UTC', new Date('2026-10-11T20:00:00.000Z'))).toBe('2026-10-11')
    })
  })

  describe('parseStoredInstant', () => {
    it('treats SQLite space-separated datetimes as UTC', () => {
      expect(parseStoredInstant('2026-09-01 06:30:00')?.toISOString()).toBe(
        '2026-09-01T06:30:00.000Z'
      )
    })

    it('passes through explicit offsets', () => {
      expect(parseStoredInstant('2026-09-01T06:30:00Z')?.toISOString()).toBe(
        '2026-09-01T06:30:00.000Z'
      )
      expect(parseStoredInstant('2026-09-01T12:00:00+05:30')?.toISOString()).toBe(
        '2026-09-01T06:30:00.000Z'
      )
    })

    it('returns null for garbage', () => {
      expect(parseStoredInstant('not-a-date')).toBeNull()
      expect(parseStoredInstant('')).toBeNull()
    })
  })

  describe('excelDateForInstant', () => {
    it('shows Kolkata wall time for a UTC instant', () => {
      // 06:30Z → 12:00 wall; serial built from wall fields.
      const cell = excelDateForInstant(new Date('2026-09-01T06:30:00.000Z'), 'Asia/Kolkata')
      expect(cell.toISOString()).toBe('2026-09-01T12:00:00.000Z')
    })

    it('maps previous-day UTC to next wall day', () => {
      // 2026-08-31 18:30Z → 01 Sep 00:00 wall.
      const cell = excelDateForInstant(new Date('2026-08-31T18:30:00.000Z'), 'Asia/Kolkata')
      expect(cell.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    })
  })

  describe('excelDateForDateOnly', () => {
    it('never crosses a calendar-day boundary', () => {
      const cell = excelDateForDateOnly('2026-08-25')
      expect(cell.getUTCFullYear()).toBe(2026)
      expect(cell.getUTCMonth()).toBe(7)
      expect(cell.getUTCDate()).toBe(25)
    })
  })
})
