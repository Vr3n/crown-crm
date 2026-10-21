/**
 * Billing-date cautions for the three billing-date pickers (#110).
 *
 * Pure and unit-tested (`tests/renderer/billing-warnings.test.ts`). All
 * cautions are renderer-local warnings — they never block submit and never
 * touch the IPC contract. The application stays binary (valid → success,
 * invalid → VALIDATION_ERROR); the backend re-validates the date shape.
 */

export type BillingDateCautionCode = 'BACKDATED' | 'GST_30_DAY' | 'FY_MISMATCH'

export interface BillingDateCaution {
  code: BillingDateCautionCode
  /** Primary notice line. */
  message: string
  /** Optional second line (statute citation / source). Plain text: the app
   * has no external-link plumbing, so sources are cited, not linked. */
  source?: string
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

/** Whole days from `from` to `to` (both YYYY-MM-DD, UTC-based, DST-proof). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000
  )
}

/** Financial year label for a YYYY-MM-DD date (April–March), e.g. "FY 2025-26". */
export function financialYearOf(dateIso: string): string {
  const [y, m] = dateIso.split('-').map(Number)
  const startYear = m >= 4 ? y : y - 1
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

/**
 * Cautions for a picked billing `issueDate` relative to `todayIso`
 * (both YYYY-MM-DD). Invalid input yields no cautions — shape validation
 * owns that case. Future dates yield none (advance paperwork is allowed).
 */
export function billingDateCautions(issueDate: string, todayIso: string): BillingDateCaution[] {
  if (!DATE_REGEX.test(issueDate) || !DATE_REGEX.test(todayIso)) return []
  if (issueDate > todayIso) return []

  const cautions: BillingDateCaution[] = []
  if (issueDate < todayIso) {
    cautions.push({
      code: 'BACKDATED',
      message: 'Back-dated entry — the invoice number uses this date\u2019s series'
    })
  }
  if (daysBetween(issueDate, todayIso) > 30) {
    cautions.push({
      code: 'GST_30_DAY',
      message:
        'Older than 30 days — CGST Rule 47 requires service invoices within 30 days of supply; confirm the tax treatment with your CA',
      source: 'Source: CBIC Invoice Rules — https://cbic-gst.gov.in/gst-invoice-rules.html'
    })
  }
  if (financialYearOf(issueDate) !== financialYearOf(todayIso)) {
    cautions.push({
      code: 'FY_MISMATCH',
      message: `Falls in ${financialYearOf(issueDate)}, not the current ${financialYearOf(todayIso)} — report it in that period\u2019s GSTR-1`
    })
  }
  return cautions
}
