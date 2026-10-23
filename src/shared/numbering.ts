/**
 * Pure voucher numbering helpers shared by the main process and the renderer.
 * The renderer uses the same formatter for its live preview, so a preview can
 * never disagree with the posted number.
 */

/** `prefix + zero padded value + suffix`, e.g. `PUR/2026-27/0001`. */
export function formatVoucherNumber(
  prefix: string,
  value: number,
  padding: number,
  suffix: string
): string {
  const padded = String(Math.trunc(value)).padStart(Math.max(1, padding), '0')
  return `${prefix}${padded}${suffix}`
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
const AFFIX_RE = /^[A-Z0-9/\-_. ]{0,24}$/i

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
  if (!AFFIX_RE.test(input.prefix)) return 'Prefix may use letters, digits, /, -, _ and .'
  if (!AFFIX_RE.test(input.suffix)) return 'Suffix may use letters, digits, /, -, _ and .'
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
  return undefined
}
