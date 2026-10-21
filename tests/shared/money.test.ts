import { describe, it, expect } from 'vitest'
import {
  minorToMajor,
  parseToMinor,
  exponentFor,
  formatMinor,
  percentToBps,
  formatRate
} from '../../src/shared/contracts/money'

describe('minorToMajor', () => {
  it('converts 24500 INR → "245"', () => {
    expect(minorToMajor(24500, 'INR')).toBe('245')
  })

  it('converts 24525 INR → "245.25"', () => {
    expect(minorToMajor(24525, 'INR')).toBe('245.25')
  })

  it('converts 0 INR → "0"', () => {
    expect(minorToMajor(0, 'INR')).toBe('0')
  })

  it('converts 1234 JPY → "1234" (zero-decimal)', () => {
    expect(minorToMajor(1234, 'JPY')).toBe('1234')
  })

  it('converts 1234 KWD → "1.234" (three-decimal)', () => {
    expect(minorToMajor(1234, 'KWD')).toBe('1.234')
  })

  it('converts 10050 EUR → "100.50"', () => {
    expect(minorToMajor(10050, 'EUR')).toBe('100.50')
  })
})

describe('parseToMinor – half-even rounding', () => {
  it('parses "245" INR → 24500', () => {
    expect(parseToMinor('245', 'INR')).toBe(24500)
  })

  it('parses "245.25" INR → 24525', () => {
    expect(parseToMinor('245.25', 'INR')).toBe(24525)
  })

  it('rounds "245.254" INR → 24525 (down)', () => {
    expect(parseToMinor('245.254', 'INR')).toBe(24525)
  })

  it('rounds "245.255" INR → 24526 (half-even, 5 is odd → round up)', () => {
    expect(parseToMinor('245.255', 'INR')).toBe(24526)
  })

  it('rounds "245.265" INR → 24526 (half-even, 6 is even → keep)', () => {
    expect(parseToMinor('245.265', 'INR')).toBe(24526)
  })

  it('rounds "245.275" INR → 24528 (half-even, 7 is odd → round up)', () => {
    expect(parseToMinor('245.275', 'INR')).toBe(24528)
  })

  it('rounds "1.005" INR → 100 (half-even, 0 is even → keep)', () => {
    expect(parseToMinor('1.005', 'INR')).toBe(100)
  })

  it('rounds "245.995" INR → 24600 (carry through)', () => {
    expect(parseToMinor('245.995', 'INR')).toBe(24600)
  })

  it('rounds "99.999" INR → 10000 (carry through)', () => {
    expect(parseToMinor('99.999', 'INR')).toBe(10000)
  })

  it('returns undefined for empty string', () => {
    expect(parseToMinor('', 'INR')).toBeUndefined()
  })

  it('returns undefined for non-numeric string', () => {
    expect(parseToMinor('abc', 'INR')).toBeUndefined()
  })

  it('strips commas from "19,200.50" INR → 1920050', () => {
    expect(parseToMinor('19,200.50', 'INR')).toBe(1920050)
  })
})

describe('parseToMinor – zero-decimal (JPY)', () => {
  it('parses "1500" JPY → 1500', () => {
    expect(parseToMinor('1500', 'JPY')).toBe(1500)
  })

  it('truncates "1500.4" JPY → 1500 (no rounding for zero-decimal)', () => {
    expect(parseToMinor('1500.4', 'JPY')).toBe(1500)
  })

  it('truncates "1500.5" JPY → 1500 (zero-decimal ignores fraction)', () => {
    expect(parseToMinor('1500.5', 'JPY')).toBe(1500)
  })

  it('truncates "1501.5" JPY → 1502 (fraction digits beyond exp → rounded via half-even)', () => {
    expect(parseToMinor('1501.5', 'JPY')).toBe(1502)
  })
})

describe('parseToMinor – three-decimal (KWD)', () => {
  it('parses "1.234" KWD → 1234', () => {
    expect(parseToMinor('1.234', 'KWD')).toBe(1234)
  })

  it('rounds "1.2345" KWD → 1234 (half-even, 4 is even → keep)', () => {
    expect(parseToMinor('1.2345', 'KWD')).toBe(1234)
  })

  it('rounds "1.2355" KWD → 1236 (half-even, 5 is odd → round up)', () => {
    expect(parseToMinor('1.2355', 'KWD')).toBe(1236)
  })
})

describe('parseToMinor – negative/plus rejected', () => {
  it('rejects "-1.00"', () => {
    expect(parseToMinor('-1.00', 'INR')).toBeUndefined()
  })

  it('rejects " -1.00 " with whitespace', () => {
    expect(parseToMinor(' -1.00 ', 'INR')).toBeUndefined()
  })

  it('rejects "+1.00"', () => {
    expect(parseToMinor('+1.00', 'INR')).toBeUndefined()
  })
})

describe('exponentFor', () => {
  it('returns 2 for INR', () => {
    expect(exponentFor('INR')).toBe(2)
  })

  it('returns 0 for JPY', () => {
    expect(exponentFor('JPY')).toBe(0)
  })

  it('returns 3 for KWD', () => {
    expect(exponentFor('KWD')).toBe(3)
  })

  it('returns 2 for AED', () => {
    expect(exponentFor('AED')).toBe(2)
  })

  it('returns 2 for SGD', () => {
    expect(exponentFor('SGD')).toBe(2)
  })

  it('throws for unknown code XXX', () => {
    expect(() => exponentFor('XXX')).toThrow('Unknown currency: XXX')
  })
})

describe('percentToBps / formatRate', () => {
  it('converts 18.5% → 1850 bps', () => {
    expect(percentToBps(18.5)).toBe(1850)
  })

  it('converts 18% → 1800 bps', () => {
    expect(percentToBps(18)).toBe(1800)
  })

  it('formats 1850 bps → "18.5%"', () => {
    expect(formatRate(1850)).toBe('18.5%')
  })

  it('formats 1800 bps → "18%"', () => {
    expect(formatRate(1800)).toBe('18%')
  })
})

describe('AED / SGD round-trip', () => {
  it('parses "100.50" AED → 10050', () => {
    expect(parseToMinor('100.50', 'AED')).toBe(10050)
  })

  it('parses "100.50" SGD → 10050', () => {
    expect(parseToMinor('100.50', 'SGD')).toBe(10050)
  })

  it('AED: minorToMajor(10050) === "100.50"', () => {
    expect(minorToMajor(10050, 'AED')).toBe('100.50')
  })

  it('SGD: minorToMajor(10050) === "100.50"', () => {
    expect(minorToMajor(10050, 'SGD')).toBe('100.50')
  })
})

describe('formatMinor', () => {
  it('formats 24525 INR containing "245.25"', () => {
    expect(formatMinor(24525, 'INR')).toContain('245.25')
  })
})

describe('Invariant: parseToMinor ∘ minorToMajor round-trip', () => {
  it('INR: 24500', () => {
    expect(parseToMinor(minorToMajor(24500, 'INR'), 'INR')).toBe(24500)
  })

  it('INR: 24525', () => {
    expect(parseToMinor(minorToMajor(24525, 'INR'), 'INR')).toBe(24525)
  })

  it('INR: 0', () => {
    expect(parseToMinor(minorToMajor(0, 'INR'), 'INR')).toBe(0)
  })

  it('JPY: 1234', () => {
    expect(parseToMinor(minorToMajor(1234, 'JPY'), 'JPY')).toBe(1234)
  })

  it('KWD: 1234', () => {
    expect(parseToMinor(minorToMajor(1234, 'KWD'), 'KWD')).toBe(1234)
  })

  it('EUR: 10050', () => {
    expect(parseToMinor(minorToMajor(10050, 'EUR'), 'EUR')).toBe(10050)
  })

  it('USD: 9999', () => {
    expect(parseToMinor(minorToMajor(9999, 'USD'), 'USD')).toBe(9999)
  })

  it('GBP: 1', () => {
    expect(parseToMinor(minorToMajor(1, 'GBP'), 'GBP')).toBe(1)
  })
})
