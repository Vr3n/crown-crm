/** Module 02 presentational helpers — short date ranges. */

/** "5 Jan" — the directory default so months stay abbreviated (design guide). */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso))
}

/** "Jan 2026" — for history lists where the year carries meaning. */
export function formatMonthYear(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(new Date(iso))
}

/** Whole days from now to the given timestamp (negative when past). */
export function daysUntil(iso: string, now: number): number {
  return Math.ceil((new Date(iso).getTime() - now) / 86_400_000)
}

/** Whole calendar months elapsed since the given timestamp (never negative). */
export function monthsSince(iso: string, now: number): number {
  const from = new Date(iso)
  const months = (now - from.getTime()) / (30.44 * 86_400_000)
  return Math.max(0, Math.floor(months))
}
