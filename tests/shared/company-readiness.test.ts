import { describe, expect, it } from 'vitest'
import {
  companyReadiness,
  financialYearLabel,
  type CompanyReadinessInput
} from '../../src/renderer/src/lib/company-readiness'

const today = new Date(2026, 10, 6)
const profile: CompanyReadinessInput = {
  gstin: '27ABCDE1234F1Z5',
  numberingSetupAt: '2026-11-01T10:30:00',
  booksBeginDate: '2026-04-01',
  fyStartMonth: 4
}

describe('companyReadiness', () => {
  it('keeps a missing GSTIN optional once numbering is set', () => {
    const readiness = companyReadiness({ ...profile, gstin: null }, today)

    expect(readiness.nextAction).toEqual({
      id: 'gstin',
      label: 'Add GSTIN (optional)',
      href: '#company-identity',
      optional: true
    })
    expect(readiness.checks.find((check) => check.id === 'gstin')).toMatchObject({
      value: 'Not on file',
      tone: 'neutral'
    })
  })

  it('asks for numbering when GSTIN is on file and numbering is not set', () => {
    const readiness = companyReadiness({ ...profile, numberingSetupAt: null }, today)

    expect(readiness.nextAction).toEqual({
      id: 'numbering',
      label: 'Set up voucher numbering',
      href: '/settings/numbering',
      optional: false
    })
    expect(readiness.checks.find((check) => check.id === 'numbering')).toMatchObject({
      value: 'Not set',
      tone: 'warning'
    })
    expect(readiness.checks.find((check) => check.id === 'gstin')?.tone).toBe('success')
  })

  it('asks for required numbering before an optional GSTIN when both are missing', () => {
    const readiness = companyReadiness({ ...profile, gstin: null, numberingSetupAt: null }, today)

    expect(readiness.nextAction?.id).toBe('numbering')
    expect(readiness.checks.find((check) => check.id === 'numbering')?.value).toBe('Not set')
    expect(readiness.checks.find((check) => check.id === 'gstin')?.tone).toBe('neutral')
  })

  it('has no next action once GSTIN and numbering are set', () => {
    const readiness = companyReadiness(profile, today)

    expect(readiness.nextAction).toBeNull()
    expect(readiness.checks.map((check) => check.value)).toEqual([
      '27ABCDE1234F1Z5',
      'Set',
      '1 Apr 2026',
      '2026–27'
    ])
  })

  it('shows the financial year for the start month before and after April', () => {
    expect(financialYearLabel(4, new Date(2026, 2, 31))).toBe('2025–26')
    expect(financialYearLabel(4, new Date(2026, 3, 1))).toBe('2026–27')
    expect(financialYearLabel(1, new Date(2026, 0, 1))).toBe('2026–27')
  })
})
