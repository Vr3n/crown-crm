/**
 * Validation for per-document Terms & Conditions (Issue #111). Pure functions so
 * the dialog validators stay unit-testable: max length keeps the PDF footer on a
 * single page, and raw HTML is rejected (templates escape, but the input should
 * never *invite* markup).
 */

/** Boundary cap for a per-document Terms block (`updateOrganizationInputSchema`). */
export const ORG_TERMS_MAX_LENGTH = 2000

/** Returns an error message for a terms field, or undefined when valid. */
export function termsError(value: string): string | undefined {
  if (value.length > ORG_TERMS_MAX_LENGTH) {
    return `Keep terms under ${ORG_TERMS_MAX_LENGTH} characters`
  }
  if (/<[^>]*>/.test(value)) {
    return 'HTML is not allowed'
  }
  return undefined
}