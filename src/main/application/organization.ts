import { organizationRepo } from '../repositories/identity'
import { resolveTimezone } from '../domain/dates'

/**
 * Shared Organization helpers for application use cases.
 *
 * `orgTimezone` used to live privately in `application/leads.ts`; it is
 * generic (Billing, Memberships and Export need it too), so it lives here and
 * every caller imports it — no billing→leads coupling.
 */

/** The Organization's IANA timezone, falling back when unset/invalid. */
export function orgTimezone(organizationId: number): string {
  return resolveTimezone(organizationRepo.findById(organizationId)?.timezone)
}
