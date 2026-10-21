import type { Lead } from './types'
import { isTerminal } from './constants'

/**
 * Data-quality flags derived from a lead's raw fields. These surface the
 * "real-world dirty data" (docs: missing / malformed / placeholder / stale /
 * unowned / duplicated) as subtle warnings instead of silently hiding it. They
 * also power the "operationally suspicious" next-action signal from Module 01
 * §25 (a non-terminal lead with no scheduled next action is a leak).
 */
export interface LeadQuality {
  noPhone: boolean
  noEmail: boolean
  emailInvalid: boolean
  placeholder: boolean
  noOwner: boolean
  overdueFollowUp: boolean
  noNextAction: boolean
  /** True when this record is (probably) a duplicate of another. */
  duplicate: boolean
}

const PLACEHOLDER = /^(test|tester|demo|n\/a|unknown|na)$/i
const PHONE_JUNK = /^(0+|1+|999+)$/

function countOpenFollowUps(lead: Lead): number {
  return lead.followUps.filter((f) => !f.completedAt).length
}

function firstOverdueFollowUp(lead: Lead): boolean {
  return lead.followUps.some((f) => !f.completedAt && new Date(f.dueAt).getTime() < Date.now())
}

export function computeQuality(lead: Lead, all: Lead[] = []): LeadQuality {
  const phone = lead.phone?.trim() ?? ''
  const email = lead.email?.trim() ?? ''
  const name = lead.name.trim()

  const placeholder =
    PLACEHOLDER.test(name) ||
    (!!phone && PHONE_JUNK.test(phone.replace(/\D/g, ''))) ||
    /^test@|@test\.|test\.com|n\/a/i.test(email)

  const noNextAction = !isTerminal(lead.stage) && countOpenFollowUps(lead) === 0

  // Duplicate: same normalized phone or email on another lead.
  const normPhone = (p?: string): string => p?.replace(/[^0-9+]/g, '') ?? ''
  const normEmail = (e?: string): string => e?.trim().toLowerCase() ?? ''
  const duplicate = all.some((o) => {
    if (o.id === lead.id) return false
    const p = normPhone(o.phone)
    const e = normEmail(o.email)
    return (!!p && p === normPhone(phone)) || (!!e && e !== '' && e === normEmail(email))
  })

  return {
    noPhone: !phone,
    noEmail: !email,
    emailInvalid: !!email && !email.includes('@'),
    placeholder,
    noOwner: !lead.owner,
    overdueFollowUp: firstOverdueFollowUp(lead),
    noNextAction,
    duplicate
  }
}

/** Count of data-quality issues worth a visible warning badge. */
export function qualityTier(q: LeadQuality): 'clean' | 'warn' | 'bad' {
  const bad = q.noPhone || q.placeholder || q.emailInvalid
  const warn = q.noEmail || q.noOwner || q.duplicate
  if (bad) return 'bad'
  if (warn) return 'warn'
  return 'clean'
}

export function qualityMessage(q: LeadQuality): string {
  const parts: string[] = []
  if (q.placeholder) parts.push('Looks like placeholder data')
  if (q.noPhone) parts.push('No phone number')
  if (q.emailInvalid) parts.push('Email looks invalid')
  if (q.noEmail) parts.push('No email')
  if (q.noOwner) parts.push('No owner assigned')
  if (q.duplicate) parts.push('Possible duplicate record')
  if (q.overdueFollowUp) parts.push('Overdue follow-up')
  if (q.noNextAction) parts.push('No next action scheduled')
  return parts.join(' · ')
}
