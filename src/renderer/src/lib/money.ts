/**
 * Money — the single place money is converted and formatted.
 *
 * All conversion/formatting delegates to the shared contracts module.
 * This file only re-exports it (no currency defaults) plus the renderer-only
 * `sanitizeMoneyInput` input-sanitizer helper.
 */

export {
  formatMinor,
  minorToMajor,
  parseToMinor,
  formatRate,
  percentToBps,
  exponentFor,
  CURRENCIES,
  type CurrencyCode,
  type Money,
  type MoneyInput,
  moneySchema,
  currencyCodeSchema
} from '../../../shared/contracts/money'

/**
 * Sanitize a free-text money input into a plain decimal string that a
 * `type="text"` input can hold (digits + at most one `.`). Strips every
 * non-digit/non-dot character and truncates the fractional part to
 * `maxFractionDigits` (2 for minor-unit currencies). Returns the empty string
 * when there is nothing representable, so the field can be cleared.
 */
export function sanitizeMoneyInput(value: string, maxFractionDigits = 2): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  const before = cleaned.slice(0, dot + 1)
  const after = cleaned
    .slice(dot + 1)
    .replace(/\./g, '')
    .slice(0, maxFractionDigits)
  return before + after
}
