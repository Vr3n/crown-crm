/**
 * Indian financial year helpers. A year starts on the first day of
 * `startMonth` (April by default) and is labelled `2026-27`.
 */

/** Label for the financial year containing `dateIso` (YYYY-MM-DD). */
export function financialYearLabel(dateIso: string, startMonth = 4): string {
  const { startYear } = financialYearBounds(dateIso, startMonth)
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/** First and last calendar day of the financial year containing the date. */
export function financialYearBounds(
  dateIso: string,
  startMonth = 4
): { startYear: number; start: string; end: string } {
  const [year, month] = dateIso.split('-').map(Number)
  if (!year || !month) throw new Error(`Invalid date: ${dateIso}`)
  const startYear = month >= startMonth ? year : year - 1
  const endYear = startMonth === 1 ? startYear : startYear + 1
  const endMonth = startMonth === 1 ? 12 : startMonth - 1
  return {
    startYear,
    start: `${startYear}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${endYear}-${String(endMonth).padStart(2, '0')}-${lastDay(endYear, endMonth)}`
  }
}

function lastDay(year: number, month: number): string {
  return String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')
}
