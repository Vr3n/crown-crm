import { describe, it, expect } from 'vitest'
import {
  InvoiceCalculationService,
  assertValidInvoiceTransition,
  deriveInvoicePrefix,
  formatDDMMYY
} from '../../src/main/domain/billing'

describe('InvoiceCalculationService', () => {
  describe('calculateLineTax', () => {
    it('computes tax with half-up rounding', () => {
      // 100000 paise * 2 * 18% = 36000 tax, line total = 236000
      const result = InvoiceCalculationService.calculateLineTax(100000, 2, 1800)
      expect(result.taxAmountMinor).toBe(36000)
      expect(result.lineTotalMinor).toBe(236000)
    })

    it('rounds tax half-up (0.5 rounds up)', () => {
      // 150000 * 1 * 15% = 22500 (exact)
      const result = InvoiceCalculationService.calculateLineTax(150000, 1, 1500)
      expect(result.taxAmountMinor).toBe(22500)
      expect(result.lineTotalMinor).toBe(172500)
    })

    it('handles zero quantity', () => {
      const result = InvoiceCalculationService.calculateLineTax(100000, 0, 1800)
      expect(result.taxAmountMinor).toBe(0)
      expect(result.lineTotalMinor).toBe(0)
    })

    it('handles zero tax rate', () => {
      const result = InvoiceCalculationService.calculateLineTax(100000, 2, 0)
      expect(result.taxAmountMinor).toBe(0)
      expect(result.lineTotalMinor).toBe(200000)
    })
  })

  describe('calculateDraftTotals', () => {
    it('sums line values correctly (no float drift)', () => {
      const lines = [
        {
          unitPriceMinor: 100000,
          quantity: 1,
          discountMinor: 0,
          taxAmountMinor: 18000,
          lineTotalMinor: 118000
        },
        {
          unitPriceMinor: 50000,
          quantity: 2,
          discountMinor: 5000,
          taxAmountMinor: 17100,
          lineTotalMinor: 117100
        }
      ]
      const totals = InvoiceCalculationService.calculateDraftTotals(lines)
      expect(totals.subtotalMinor).toBe(195000) // (100000*1 - 0) + (50000*2 - 5000)
      expect(totals.taxMinor).toBe(35100) // 18000 + 17100
      expect(totals.totalMinor).toBe(235100) // 118000 + 117100
    })

    it('returns zeros for empty lines', () => {
      const totals = InvoiceCalculationService.calculateDraftTotals([])
      expect(totals).toEqual({ subtotalMinor: 0, taxMinor: 0, totalMinor: 0 })
    })

    it('handles single line', () => {
      const lines = [
        {
          unitPriceMinor: 200000,
          quantity: 1,
          discountMinor: 10000,
          taxAmountMinor: 34200,
          lineTotalMinor: 224200
        }
      ]
      const totals = InvoiceCalculationService.calculateDraftTotals(lines)
      expect(totals).toEqual({ subtotalMinor: 190000, taxMinor: 34200, totalMinor: 224200 })
    })
  })
})

describe('deriveInvoicePrefix', () => {
  it('derives initials from multi-word org name', () => {
    expect(deriveInvoicePrefix('Crown Vitality')).toBe('CV')
  })

  it('derives single letter from single-word org name', () => {
    expect(deriveInvoicePrefix('Fitness')).toBe('F')
  })

  it('uses explicit prefix when provided', () => {
    expect(deriveInvoicePrefix('Crown Vitality', 'MYORG')).toBe('MYORG')
  })

  it('trims and uppercases explicit prefix', () => {
    expect(deriveInvoicePrefix('Crown Vitality', '  abc  ')).toBe('ABC')
  })

  it('limits explicit prefix to 6 chars', () => {
    expect(deriveInvoicePrefix('Crown Vitality', 'LONGPREFIX')).toBe('LONGPR')
  })

  it('falls back to ORG for empty org name', () => {
    expect(deriveInvoicePrefix('')).toBe('ORG')
  })

  it('handles null explicit prefix', () => {
    expect(deriveInvoicePrefix('Crown Vitality', null)).toBe('CV')
  })
})

describe('formatDDMMYY', () => {
  it('formats date as DDMMYY', () => {
    const date = new Date(2026, 0, 1) // Jan 1, 2026
    expect(formatDDMMYY(date)).toBe('010126')
  })

  it('pads single-digit day and month', () => {
    const date = new Date(2026, 8, 1) // Sep 1, 2026
    expect(formatDDMMYY(date)).toBe('010926')
  })

  it('handles end of year', () => {
    const date = new Date(2026, 11, 31) // Dec 31, 2026
    expect(formatDDMMYY(date)).toBe('311226')
  })
})

describe('assertValidInvoiceTransition', () => {
  it('allows valid transitions', () => {
    expect(() => assertValidInvoiceTransition('DRAFT', 'OPEN')).not.toThrow()
    expect(() => assertValidInvoiceTransition('OPEN', 'PARTIALLY_PAID')).not.toThrow()
    expect(() => assertValidInvoiceTransition('OPEN', 'PAID')).not.toThrow()
    expect(() => assertValidInvoiceTransition('OPEN', 'VOID')).not.toThrow()
    expect(() => assertValidInvoiceTransition('OPEN', 'UNCOLLECTIBLE')).not.toThrow()
    expect(() => assertValidInvoiceTransition('PARTIALLY_PAID', 'PAID')).not.toThrow()
  })

  it('rejects invalid transitions', () => {
    expect(() => assertValidInvoiceTransition('DRAFT', 'PAID')).toThrow(
      'Invalid invoice transition'
    )
    expect(() => assertValidInvoiceTransition('PAID', 'OPEN')).toThrow('Invalid invoice transition')
    expect(() => assertValidInvoiceTransition('VOID', 'OPEN')).toThrow('Invalid invoice transition')
    expect(() => assertValidInvoiceTransition('UNCOLLECTIBLE', 'PAID')).toThrow(
      'Invalid invoice transition'
    )
  })
})
