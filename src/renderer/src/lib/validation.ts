/**
 * Lightweight client-side validation mirroring the main-process domain rules.
 * The renderer is process-isolated from the main layer, so these repeat the
 * checks for instant UX feedback; the authoritative validation still happens
 * in the application layer (src/main/domain/phone.ts, etc.).
 */

const MOBILE_MAX = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN = 8

/** Mobile inputs never accept more than this many digits. */
export const MOBILE_MAX_DIGITS = MOBILE_MAX

/**
 * Digits only, capped at ten. A pasted Indian country code (`+91`, `0091`,
 * `91`) or trunk prefix (`0`) is removed first so the whole number still fits
 * in the field. Only full prefixes are stripped, so typing `91…` as a mobile
 * number is never mistaken for a country code.
 */
export function toMobileDigits(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits.slice(0, MOBILE_MAX_DIGITS)
}

/** How many digits a ten digit mobile number is still missing. */
export function mobileDigitsLeft(value: string): number {
  return Math.max(0, MOBILE_MAX_DIGITS - value.replace(/\D/g, '').length)
}

// Indian phone rules (mirrors src/main/domain/phone.ts):
//  - mobile:  10 digits starting 6-9, optionally prefixed +91 / 0091 / 91 / 0
//    (the prefix lives inside the regex so a '91…' mobile is never misread)
//  - landline: an STD-prefixed number (0 + 9-10 digits) or a local starting 2
const MOBILE_RE = /^(?:\+91|0091|91|0)?([6-9][0-9]{9})$/
const LANDLINE_WITH_STD_RE = /^0[0-9]{9,10}$/
const LANDLINE_LOCAL_RE = /^2[0-9]{9}$/

/** True for a valid Indian mobile or landline number (separators/prefixes allowed). */
export function isValidIndianMobile(value: string): boolean {
  if (!value || value.trim().length === 0) return false
  const cleaned = value.trim().replace(/[\s()-]/g, '')
  return (
    MOBILE_RE.test(cleaned) || LANDLINE_WITH_STD_RE.test(cleaned) || LANDLINE_LOCAL_RE.test(cleaned)
  )
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN
}

/**
 * Granular phone error. Returns the *specific* reason the value is invalid so
 * the UI can guide the user, or `undefined` when the value is valid (or still
 * too incomplete to judge). The wrong-starting-digit check runs as soon as the
 * first digit is typed — never after the number is complete.
 */
export function mobileError(value: string): string | undefined {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return 'Mobile number is required'
  if (!/^[026-9]/.test(digits)) return 'Start with 6-9 (mobile) or 0/2 (landline)'
  if (digits.length < MOBILE_MAX) return 'Enter all 10 digits'
  return undefined
}

/** Granular company-name error. */
export function companyNameError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Company name is required'
  if (trimmed.length < 2) return 'Company name must be at least 2 characters'
  return undefined
}

/** Granular full-name error. */
export function fullNameError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Owner full name is required'
  if (trimmed.length < 2) return 'Enter the owner\u2019s full name'
  return undefined
}

/** Granular lead-name error (front-desk capture). */
export function leadNameError(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Name is required'
  if (trimmed.length < 2) return 'Enter the person\u2019s full name'
  return undefined
}

/** Granular email error; `requiredMessage` is used when the field is empty. */
export function emailError(value: string, requiredMessage: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length === 0) return requiredMessage
  if (!trimmed.includes('@')) return 'Email must contain an @'
  if (!EMAIL_RE.test(trimmed)) return 'Enter a valid email like jane@example.com'
  return undefined
}

/** Setup-password error: non-empty and at least 8 characters. */
export function passwordError(value: string): string | undefined {
  if (value.length === 0) return 'Create a password'
  if (value.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`
  return undefined
}

/** Login-password error: non-empty. */
export function loginPasswordError(value: string): string | undefined {
  return value ? undefined : 'Enter your password'
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
