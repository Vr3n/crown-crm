import { z } from 'zod'

/**
 * Money crosses process boundaries as integer minor units plus a currency code —
 * never a formatted string and never a float (invariant §1). Amounts are stored
 * as integer minor units in the database; formatting happens only in the
 * renderer via `formatMinor`.
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deliberate common subset of ISO 4217 currency codes.
 * Not a complete implementation — `exponentFor` fails closed (throws) for
 * anything outside this table.
 */
export const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'KRW',
  'VND',
  'CLP',
  'ISK',
  'KWD',
  'BHD',
  'OMR',
  'JOD',
  'TND',
  'AED',
  'SGD'
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

const EXPONENTS: Record<CurrencyCode, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  KWD: 3,
  BHD: 3,
  OMR: 3,
  JOD: 3,
  TND: 3,
  AED: 2,
  SGD: 2
}

export interface Money {
  amount_minor: number // integer minor units; zod: .int().safe()
  currency: CurrencyCode
}

/* -------------------------------------------------------------------------- */
/* Functions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Look up exponent (minor units per major unit) for a currency code.
 * This is a common subset of ISO 4217, not a complete implementation.
 * Unknown codes throw — fail-closed, not fallback-to-2.
 */
export function exponentFor(code: string): number {
  if (!(code in EXPONENTS)) throw new Error(`Unknown currency: ${code}`)
  return EXPONENTS[code as CurrencyCode]
}

/**
 * Exact minor → major conversion as a decimal string.
 * Pure digit-splitting, no floats.  "24525" + exp 2 → "245.25"
 */
export function minorToMajor(minor: number, code: CurrencyCode): string {
  const exp = EXPONENTS[code]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const digits = String(abs)
  if (exp === 0) return sign + digits
  const wholePart = digits.length > exp ? digits.slice(0, -exp) : '0'
  const frac = digits.length > exp ? digits.slice(-exp) : digits.padStart(exp, '0')
  if (/^0+$/.test(frac)) return sign + wholePart
  return sign + wholePart + '.' + frac
}

/**
 * Parse a currency decimal string → integer minor units.
 * Half-even rounding on excess digits (string-based, no IEEE-754 conversion).
 * Rejects negative and `+`-prefixed inputs (nonnegative invariant).
 * Returns undefined on invalid input.
 */
export function parseToMinor(input: string, code: CurrencyCode): number | undefined {
  const GLYPHS = /[\s,₹$€£¥]/g
  const cleaned = input.replace(GLYPHS, '')
  if (cleaned === '' || cleaned.startsWith('-') || cleaned.startsWith('+')) return undefined

  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned)
  if (!match) return undefined

  const whole = match[1]
  const frac = match[2] ?? ''
  const exp = EXPONENTS[code as CurrencyCode]

  if (frac.length <= exp) {
    const minor = Number(whole + frac.padEnd(exp, '0'))
    return Number.isSafeInteger(minor) ? minor : undefined
  }

  // Round excess fractional digits half-even on the full digit string.
  const digits = whole + frac
  const scale = frac.length - exp
  const kept = digits.slice(0, -scale)
  const excess = digits.slice(-scale)
  const half = '5' + '0'.repeat(scale - 1)
  const up = excess > half ? true : excess < half ? false : Number(kept[kept.length - 1]) % 2 === 1

  const keptLen = kept.length
  const keptNum = Number(kept) + (up ? 1 : 0)
  const keptStr = String(keptNum)

  if (keptStr.length > keptLen) {
    const newWhole = String(Number(whole) + 1)
    const minor = Number(newWhole + '0'.repeat(exp))
    return Number.isSafeInteger(minor) ? minor : undefined
  }

  const newWhole = exp === 0 ? keptStr : keptStr.slice(0, keptStr.length - exp) || '0'
  const newFrac = exp === 0 ? '' : keptStr.slice(-exp).padStart(exp, '0')
  const minor = Number(newWhole + newFrac)
  return Number.isSafeInteger(minor) ? minor : undefined
}

/**
 * Format minor units for display using Intl.NumberFormat (exact string).
 *
 * Runtime assumption: `Intl.NumberFormat.format(decimalString)` on V8/ICU 78
 * (Electron 43 / Node 25) preserves exact decimal digits when the input is a
 * stringified decimal — it does NOT round-trip through the IEEE-754 double.
 * This is pinned by a regression test near 2^53. Not a general JS guarantee.
 */
export function formatMinor(minor: number, code: CurrencyCode, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code
  }).format(Number(minorToMajor(minor, code)))
}

/** Format basis points as a percent string (e.g. "18%"). */
export function formatRate(bps: number): string {
  return `${Math.round(bps) / 100}%`
}

/** Parse a decimal percent (e.g. 18.5) into integer basis points (1850). */
export function percentToBps(percent: number): number {
  return Math.round(percent * 100)
}

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                  */
/* -------------------------------------------------------------------------- */

export const currencyCodeSchema = z.enum(CURRENCIES)

export const moneySchema = z.object({
  amount_minor: z.number().int().safe(),
  currency: currencyCodeSchema
})

export type MoneyInput = z.infer<typeof moneySchema>
