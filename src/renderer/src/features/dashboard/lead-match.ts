import type { Lead } from '@/features/leads/types'
import type { PersonRef } from './types'

/**
 * Attempts to resolve a dashboard PersonRef to a sales Lead using the cached
 * leads list. Matches by phone first (most reliable), then by exact name.
 * Returns undefined when no match is found — the caller should fall back to
 * the LeadPicker.
 */
export function findLeadForMember(person: PersonRef, leads: Lead[]): Lead | undefined {
  if (person.phone) {
    const normalized = person.phone.replace(/\s+/g, '')
    const byPhone = leads.find((l) => l.phone?.replace(/\s+/g, '') === normalized)
    if (byPhone) return byPhone
  }

  if (person.name) {
    const byName = leads.find((l) => l.name === person.name)
    if (byName) return byName
  }

  return undefined
}
