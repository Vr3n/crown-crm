import { describe, expect, it } from 'vitest'
import { billingDateCautions, financialYearOf } from '@/lib/billing-warnings'

describe('billingDateCautions (#110)', () => {
  it('returns nothing for today or invalid input', () => {
    expect(billingDateCautions('2026-09-08', '2026-09-08')).toEqual([])
    expect(billingDateCautions('', '2026-09-08')).toEqual([])
    expect(billingDateCautions('tomorrow', '2026-09-08')).toEqual([])
    expect(billingDateCautions('2026-09-01', '')).toEqual([])
  })

  it('returns nothing for future dates (advance paperwork is allowed)', () => {
    expect(billingDateCautions('2027-01-15', '2026-09-08')).toEqual([])
  })

  it('flags a recent back-date with the series note only', () => {
    const cautions = billingDateCautions('2026-09-01', '2026-09-08')
    expect(cautions.map((c) => c.code)).toEqual(['BACKDATED'])
    expect(cautions[0].message).toMatch(/invoice number uses this date/)
  })

  it('adds the Rule-47 caution past 30 days, with reason and source', () => {
    const recent = billingDateCautions('2026-08-09', '2026-09-08')
    expect(recent.map((c) => c.code)).toEqual(['BACKDATED'])

    const old = billingDateCautions('2026-08-08', '2026-09-08')
    expect(old.map((c) => c.code)).toEqual(['BACKDATED', 'GST_30_DAY'])
    const gst = old.find((c) => c.code === 'GST_30_DAY')!
    expect(gst.message).toMatch(/Rule 47/)
    expect(gst.message).toMatch(/within 30 days of supply/)
    expect(gst.source).toMatch(/cbic-gst\.gov\.in/)
  })

  it('flags cross-financial-year back-dates', () => {
    const cautions = billingDateCautions('2026-03-20', '2026-04-10')
    expect(cautions.map((c) => c.code)).toEqual(['BACKDATED', 'FY_MISMATCH'])
    expect(cautions[1].message).toMatch(/FY 2025-26/)
    expect(cautions[1].message).toMatch(/GSTR-1/)
  })

  it('stays quiet within the same financial year', () => {
    const cautions = billingDateCautions('2026-04-02', '2026-04-10')
    expect(cautions.map((c) => c.code)).toEqual(['BACKDATED'])
  })
})

describe('financialYearOf', () => {
  it('cuts the year in April (April–March)', () => {
    expect(financialYearOf('2026-04-01')).toBe('FY 2026-27')
    expect(financialYearOf('2026-03-31')).toBe('FY 2025-26')
    expect(financialYearOf('2027-03-31')).toBe('FY 2026-27')
    expect(financialYearOf('2026-01-15')).toBe('FY 2025-26')
  })
})
