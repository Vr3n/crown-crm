import { ValidationError } from './errors'

/**
 * Shared business-date / timezone primitives (Module 04 §36, #110).
 *
 * Central rule: a business date is an Organization-local calendar day, while
 * `created_at` is an audit timestamp. `finalized_at` is instant-shaped storage
 * with day-precision business meaning — the Organization-local date
 * represented at noon, converted to UTC. Noon-anchoring keeps ±14h offsets
 * (including DST zones) from flipping the calendar day.
 *
 * Pure: no I/O, no Electron, no Drizzle. Unit-tested in
 * `tests/domain/dates.test.ts`.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata'

export const BUSINESS_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/** Returns true when `value` names a usable IANA timezone. */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Returns the canonical timezone, falling back when the stored value is missing/invalid. */
export function resolveTimezone(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_TIMEZONE
  return isValidTimezone(raw) ? raw : DEFAULT_TIMEZONE
}

/** Throws ValidationError unless `value` is a real YYYY-MM-DD calendar date. */
export function assertValidBusinessDate(value: string, field = 'date'): void {
  if (!BUSINESS_DATE_REGEX.test(value)) {
    throw new ValidationError(`${field} must be a YYYY-MM-DD date`)
  }
  const [y, m, d] = value.split('-').map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new ValidationError(`${field} is not a real calendar date`)
  }
}

/** Today's Organization-local wall date as YYYY-MM-DD. */
export function todayInOrgTz(timezone: string, now: Date = new Date()): string {
  const tz = resolveTimezone(timezone)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
}

/** The IANA timezone's UTC offset (minutes) for the given instant. */
export function tzOffsetMinutes(tz: string, date: Date): number {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value
    const m = part ? /GMT([+-])(\d{2}):(\d{2})/.exec(part) : null
    if (!m) return 0
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
  } catch {
    return 0
  }
}

/**
 * Business date → UTC ISO instant for storage/transport.
 * Anchors at 12:00 Organization-local so the UTC instant always falls on the
 * same calendar day in every timezone.
 */
export function businessDateToUtc(dateOnly: string, timezone: string): string {
  assertValidBusinessDate(dateOnly)
  const tz = resolveTimezone(timezone)
  const [y, m, d] = dateOnly.split('-').map(Number)
  const noonGuess = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const utc = new Date(noonGuess.getTime() - tzOffsetMinutes(tz, noonGuess) * 60_000)
  return utc.toISOString()
}

/**
 * Parses a stored instant leniently. SQLite `datetime('now')` values look like
 * `"2026-09-01 06:30:00"` (space separator, no offset) and V8 parses those as
 * *local* time — so they are normalised to explicit UTC first, mirroring the
 * renderer's `toUTCDate`. Returns null when unparseable.
 */
export function parseStoredInstant(raw: string): Date | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const hasOffset = /[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)
  const normalized = hasOffset ? trimmed : trimmed.replace(' ', 'T') + 'Z'
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * True instant → Excel cell Date showing Organization-local wall time.
 * Excel carries no timezone: the serial is built from the wall fields via
 * `Date.UTC`, so the formatted cell reads the gym's wall clock.
 */
export function excelDateForInstant(instant: Date, timezone: string): Date {
  const tz = resolveTimezone(timezone)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(instant)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return new Date(
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  )
}

/**
 * Date-only business value → Excel cell Date.
 * A source `date` has no time component, so there is nothing to shift: the
 * wall date is written as a noon-UTC serial, which can never cross a calendar
 * day under any timezone/DST rule.
 */
export function excelDateForDateOnly(dateOnly: string): Date {
  assertValidBusinessDate(dateOnly)
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
}
