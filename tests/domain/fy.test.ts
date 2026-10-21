import { describe, it, expect } from 'vitest'
import { financialYearBounds, financialYearLabel } from '../../src/main/domain/fy'

describe('financial year', () => {
  it('labels an April to March year', () => {
    expect(financialYearLabel('2026-04-01')).toBe('2026-27')
    expect(financialYearLabel('2026-09-11')).toBe('2026-27')
    expect(financialYearLabel('2027-03-31')).toBe('2026-27')
  })

  it('keeps 31 March in the previous year', () => {
    expect(financialYearLabel('2026-03-31')).toBe('2025-26')
    expect(financialYearBounds('2026-03-31')).toEqual({
      startYear: 2025,
      start: '2025-04-01',
      end: '2026-03-31'
    })
  })

  it('handles a non April start', () => {
    expect(financialYearLabel('2026-12-15', 1)).toBe('2026-27')
    expect(financialYearBounds('2026-12-15', 1)).toEqual({
      startYear: 2026,
      start: '2026-01-01',
      end: '2026-12-31'
    })
  })

  it('rejects an unparseable date', () => {
    expect(() => financialYearLabel('not-a-date')).toThrow()
  })
})
