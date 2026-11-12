/**
 * What the company profile must carry before documents and reports can rely on
 * it. Pure so the page and its tests read the same rules.
 */

export type ReadinessTone = 'success' | 'warning' | 'neutral'

export interface CompanyReadinessInput {
  gstin: string | null
  numberingSetupAt: string | null
  booksBeginDate: string
  fyStartMonth: number
}

export interface CompanyReadinessCheck {
  id: 'gstin' | 'numbering' | 'books' | 'financial-year'
  label: string
  value: string
  tone: ReadinessTone
  detail?: string
}

export interface CompanyReadinessAction {
  id: 'gstin' | 'numbering'
  label: string
  href: string
  optional: boolean
}

export interface CompanyReadiness {
  checks: CompanyReadinessCheck[]
  nextAction: CompanyReadinessAction | null
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/** Business date for a settings summary. `Not set` when the profile has none. */
export function formatCompanyDate(value: string): string {
  if (!value) return 'Not set'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${day} ${SHORT_MONTHS[month - 1] ?? month} ${year}`
}

/** The financial year the start month puts today in. */
export function financialYearLabel(startMonth: number, today = new Date()): string {
  const month = Math.min(12, Math.max(1, Math.trunc(startMonth)))
  const year = today.getMonth() + 1 >= month ? today.getFullYear() : today.getFullYear() - 1
  return `${year}–${String((year + 1) % 100).padStart(2, '0')}`
}

/**
 * Numbering first because no voucher can post without a number. GSTIN second
 * and neutral, because an unregistered business is a legitimate state.
 */
export function companyReadiness(
  profile: CompanyReadinessInput,
  today = new Date()
): CompanyReadiness {
  const gstin = profile.gstin?.trim() ?? ''
  const numberingSet = Boolean(profile.numberingSetupAt)

  const checks: CompanyReadinessCheck[] = [
    {
      id: 'gstin',
      label: 'GSTIN',
      value: gstin || 'Not on file',
      tone: gstin ? 'success' : 'neutral',
      detail: gstin ? undefined : 'Optional if the business is unregistered'
    },
    {
      id: 'numbering',
      label: 'Voucher numbering',
      value: numberingSet ? 'Set' : 'Not set',
      tone: numberingSet ? 'success' : 'warning',
      detail: numberingSet ? undefined : 'Needed before the first voucher'
    },
    {
      id: 'books',
      label: 'Books begin',
      value: formatCompanyDate(profile.booksBeginDate),
      tone: 'neutral'
    },
    {
      id: 'financial-year',
      label: 'Financial year',
      value: financialYearLabel(profile.fyStartMonth, today),
      tone: 'neutral'
    }
  ]

  if (!numberingSet) {
    return {
      checks,
      nextAction: {
        id: 'numbering',
        label: 'Set up voucher numbering',
        href: '/settings/numbering',
        optional: false
      }
    }
  }

  if (!gstin) {
    return {
      checks,
      nextAction: {
        id: 'gstin',
        label: 'Add GSTIN (optional)',
        href: '#company-identity',
        optional: true
      }
    }
  }

  return { checks, nextAction: null }
}
