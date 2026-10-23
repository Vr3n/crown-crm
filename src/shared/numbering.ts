/**
 * Pure voucher numbering helpers shared by the main process and the renderer.
 * The renderer uses the same formatter for its live preview, so a preview can
 * never disagree with the posted number.
 */

/** Tokens that may appear in a prefix or suffix. */
export const NUMBER_TOKENS = [
  '{YYYY}',
  '{YY}',
  '{MM}',
  '{DD}',
  '{YYYYMM}',
  '{FY}',
  '{FY_SHORT}'
] as const

const TOKEN_SET = new Set<string>(NUMBER_TOKENS)

export interface NumberTokenContext {
  /** Voucher date, YYYY-MM-DD. Tokens are left untouched when absent. */
  date?: string
  /** Financial year label, for example 2026-27. */
  fy?: string
}

/**
 * Expands date and financial year tokens in a prefix or suffix.
 *
 * `INV/{YYYYMM}` on 2026-07-13 becomes `INV/202607`, which with a three digit
 * serial gives `INV/202607001`.
 */
export function resolveNumberTokens(template: string, context: NumberTokenContext): string {
  return template.replace(/\{(YYYYMM|YYYY|YY|MM|DD|FY_SHORT|FY)\}/g, (match, token: string) => {
    const [year, month, day] = (context.date ?? '').split('-')
    switch (token) {
      case 'YYYY':
        return year || match
      case 'YY':
        return year ? year.slice(-2) : match
      case 'MM':
        return month || match
      case 'DD':
        return day || match
      case 'YYYYMM':
        return year && month ? `${year}${month}` : match
      case 'FY':
        return context.fy || match
      case 'FY_SHORT':
        return context.fy
          ? context.fy
              .split('-')
              .map((part) => part.slice(-2))
              .join('-')
          : match
      default:
        return match
    }
  })
}

/** `prefix + zero padded value + suffix`, e.g. `PUR/2026-27/0001`. */
export function formatVoucherNumber(
  prefix: string,
  value: number,
  padding: number,
  suffix: string,
  context: NumberTokenContext = {}
): string {
  const padded = String(Math.trunc(value)).padStart(Math.max(1, padding), '0')
  return `${resolveNumberTokens(prefix, context)}${padded}${resolveNumberTokens(suffix, context)}`
}

/** The next value for a period. A fresh period starts at the configured number. */
export function nextSequenceValue(
  lastValue: number | null | undefined,
  startNumber: number
): number {
  const floor = Math.max(0, startNumber - 1)
  return Math.max(lastValue ?? 0, floor) + 1
}

const SERIES_RE = /^[A-Z][A-Z0-9]{1,7}$/
const AFFIX_RE = /^[A-Z0-9/\-{}]{0,40}$/i
const MAX_VOUCHER_NUMBER_LENGTH = 16
const SAMPLE_DATE = '2026-07-13'
const SAMPLE_FY = '2026-27'

/** Tokens in a template that the formatter does not know. */
export function unknownNumberTokens(template: string): string[] {
  const found = template.match(/\{[^{}]*\}/g) ?? []
  return found.filter((token) => !TOKEN_SET.has(token))
}

export type NumberResetPeriod = 'YEARLY' | 'MONTHLY' | 'NEVER'

/**
 * The bucket a counter belongs to. Monthly reset gives every YYYY-MM its own
 * sequence, yearly uses the financial year, and never uses one continuous run.
 */
export function sequencePeriod(date: string, fy: string, reset: NumberResetPeriod): string {
  if (reset === 'MONTHLY') return date.slice(0, 7)
  if (reset === 'YEARLY') return fy
  return 'ALL'
}

/** Resolved length of a number built from this template and width. */
export function voucherNumberLength(
  prefix: string,
  padding: number,
  suffix: string,
  context: NumberTokenContext = { date: SAMPLE_DATE, fy: SAMPLE_FY }
): number {
  return formatVoucherNumber(prefix, 1, padding, suffix, context).length
}

export interface NumberingSettingInput {
  series: string
  prefix: string
  suffix: string
  padding: number
  startNumber: number
}

/** Returns a user facing message, or undefined when the setting is valid. */
export function validateNumberingSetting(input: NumberingSettingInput): string | undefined {
  const series = input.series.trim().toUpperCase()
  if (!SERIES_RE.test(series)) {
    return 'Series must be 2 to 8 letters or digits, starting with a letter'
  }
  if (!AFFIX_RE.test(input.prefix)) {
    return 'Prefix may use letters, digits, /, - and the date tokens'
  }
  if (!AFFIX_RE.test(input.suffix)) {
    return 'Suffix may use letters, digits, /, - and the date tokens'
  }
  const unknown = [...unknownNumberTokens(input.prefix), ...unknownNumberTokens(input.suffix)]
  if (unknown.length > 0) {
    return `Unknown token ${unknown[0]}. Use ${NUMBER_TOKENS.join(', ')}`
  }
  if (!Number.isInteger(input.padding) || input.padding < 1 || input.padding > 8) {
    return 'Width must be between 1 and 8 digits'
  }
  if (
    !Number.isInteger(input.startNumber) ||
    input.startNumber < 1 ||
    input.startNumber > 99999999
  ) {
    return 'Starting number must be between 1 and 99999999'
  }
  const length = voucherNumberLength(input.prefix, input.padding, input.suffix)
  if (length > MAX_VOUCHER_NUMBER_LENGTH) {
    return `The number is ${length} characters. GST allows ${MAX_VOUCHER_NUMBER_LENGTH}. Shorten the prefix or width`
  }
  return undefined
}
