import { ValidationError } from './errors'

/**
 * Indian phone number (mobile or landline), normalized for storage.
 *
 * Mobile: exactly 10 digits whose first digit is 6-9 (per TRAI/DoT the only
 * series allocated to mobile). Users may enter a country-code prefix (`+91`,
 * `91`, `0091`) or a leading `0`; those are normalized away so the DB keeps
 * one bare 10-digit form — this is the identity key for `people`.
 *
 * Landline: an STD-prefixed number (`0` + 9-10 digits, e.g. `0221234567`) or
 * a 10-digit local starting with `2`. These are stored as entered (leading
 * zero kept) because there is no single canonical bare form.
 */
export class IndianPhoneNumber {
  /** The normalized value (bare 10-digit mobile, or the landline as entered). */
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Validates `raw` and returns the normalized value object. Throws
   * `ValidationError` if the input is blank or not a valid Indian number.
   */
  static parse(raw: string): IndianPhoneNumber {
    if (!raw || raw.trim().length === 0) {
      throw new ValidationError('Mobile number is required')
    }

    const cleaned = raw.trim().replace(/[\s()-]/g, '')

    // Mobile: 10 digits starting 6-9, optionally prefixed +91 / 0091 / 91 / 0.
    // The prefix is part of the regex so backtracking keeps a 10-digit mobile
    // like '9111111111' intact (never '91' + 8 digits).
    const mobile = cleaned.match(/^(?:\+91|0091|91|0)?([6-9][0-9]{9})$/)
    if (mobile) {
      return new IndianPhoneNumber(mobile[1])
    }

    // Landline: STD-prefixed (0 + 9-10 digits) or a 10-digit local starting 2.
    if (/^0[0-9]{9,10}$/.test(cleaned) || /^2[0-9]{9}$/.test(cleaned)) {
      return new IndianPhoneNumber(cleaned)
    }

    throw new ValidationError('Enter a valid 10-digit Indian mobile or landline number')
  }

  /** Validates `raw`; returns the value object, or `null` if invalid. */
  static tryParse(raw: string): IndianPhoneNumber | null {
    try {
      return IndianPhoneNumber.parse(raw)
    } catch {
      return null
    }
  }

  toString(): string {
    return this.value
  }
}

/** @deprecated Use {@link IndianPhoneNumber} (accepts mobiles and landlines). */
export class IndianMobileNumber {
  /** The canonical 10-digit value, e.g. `9876543210`. */
  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  /**
   * Validates `raw` and returns the normalized value object. Throws
   * `ValidationError` if the input is blank or not a valid Indian mobile number.
   */
  static parse(raw: string): IndianMobileNumber {
    const parsed = IndianPhoneNumber.parse(raw)
    return new IndianMobileNumber(parsed.value)
  }

  /** Validates `raw`; returns the value object, or `null` if invalid. */
  static tryParse(raw: string): IndianMobileNumber | null {
    try {
      return IndianMobileNumber.parse(raw)
    } catch {
      return null
    }
  }

  toString(): string {
    return this.value
  }
}
