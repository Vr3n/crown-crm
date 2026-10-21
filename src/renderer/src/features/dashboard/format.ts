/** Presentational helpers for the dashboard — day deltas and cold-lead math. */

/**
 * Parse a datetime string from SQLite's `datetime('now')` as UTC.
 * SQLite stores UTC without a 'Z' suffix; V8 parses space-separated
 * dates as LOCAL time, so we normalise to force UTC parsing.
 */
function toUTCDate(iso: string): Date {
  if (iso.endsWith('Z') || iso.includes('+')) {
    return new Date(iso)
  }
  return new Date(iso.replace(' ', 'T') + 'Z')
}

/** Whole days from "now" to the given timestamp (negative when past). */
export function daysUntil(iso: string): number {
  const ms = toUTCDate(iso).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

/** Whole days elapsed since the given timestamp (never below 0 for display). */
export function daysSince(iso: string): number {
  const ms = Date.now() - toUTCDate(iso).getTime()
  return Math.max(0, Math.floor(ms / 86400000))
}
