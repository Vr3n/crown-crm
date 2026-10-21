import { describe, it, expect } from 'vitest'
import { convertCellValue } from '../../../src/main/application/export'

const KOLKATA = 'Asia/Kolkata'

/** Read a cell Date back as UTC ISO for assertions. */
function iso(cell: unknown): string | null {
  return cell instanceof Date ? cell.toISOString() : null
}

describe('convertCellValue date/timezone boundaries (#110)', () => {
  it('passes date-only through as the wall date', () => {
    expect(iso(convertCellValue('2026-09-01', 'date', KOLKATA, 'INR'))).toBe(
      '2026-09-01T12:00:00.000Z'
    )
    expect(iso(convertCellValue('2026-09-01', 'isodate', KOLKATA, 'INR'))).toBe(
      '2026-09-01T12:00:00.000Z'
    )
  })

  it('never moves a date-only value across a day boundary', () => {
    const cell = convertCellValue('2026-08-25', 'date', KOLKATA, 'INR') as Date
    expect(cell.getUTCFullYear()).toBe(2026)
    expect(cell.getUTCMonth()).toBe(7)
    expect(cell.getUTCDate()).toBe(25)
  })

  it('parses SQLite datetimes as UTC then shows wall time', () => {
    // 06:30Z → 12:00 wall.
    expect(iso(convertCellValue('2026-09-01 06:30:00', 'datetime', KOLKATA, 'INR'))).toBe(
      '2026-09-01T12:00:00.000Z'
    )
  })

  it('handles UTC ISO datetimes identically', () => {
    expect(iso(convertCellValue('2026-09-01T06:30:00Z', 'datetime', KOLKATA, 'INR'))).toBe(
      '2026-09-01T12:00:00.000Z'
    )
  })

  it('maps near-boundary UTC to the correct wall time', () => {
    // 00:30Z → 06:00 wall, same wall day.
    expect(iso(convertCellValue('2026-09-01 00:30:00Z', 'datetime', KOLKATA, 'INR'))).toBe(
      '2026-09-01T06:00:00.000Z'
    )
  })

  it('maps previous-day UTC onto the next wall day', () => {
    // 2026-08-31 18:30Z → 01 Sep 00:00 wall.
    expect(iso(convertCellValue('2026-08-31 18:30:00Z', 'datetime', KOLKATA, 'INR'))).toBe(
      '2026-09-01T00:00:00.000Z'
    )
  })

  it('respects a DST timezone', () => {
    // New York summer (UTC-4): 16:00Z → 12:00 wall.
    expect(
      iso(convertCellValue('2026-08-10T16:00:00Z', 'datetime', 'America/New_York', 'USD'))
    ).toBe('2026-08-10T12:00:00.000Z')
  })

  it('returns null for garbage instead of Invalid Date', () => {
    expect(convertCellValue('not-a-date', 'datetime', KOLKATA, 'INR')).toBeNull()
    expect(convertCellValue('', 'date', KOLKATA, 'INR')).toBeNull()
    expect(convertCellValue(null, 'date', KOLKATA, 'INR')).toBeNull()
  })
})
