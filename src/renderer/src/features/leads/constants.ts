import type {
  ActivityTypeKey,
  Lead,
  LeadFilters,
  LostReasonKey,
  SourceKey,
  StageConfig,
  StageKey
} from './types'

/**
 * Config-driven stage pipeline (Module 01 decision): stages are a small
 * reference table with boolean flags, not hard-coded status logic. The seeded
 * recommended defaults below are editable later; UI logic only branches on
 * `isWon` / `isLost`.
 */
export const STAGES: StageConfig[] = [
  { key: 'NEW', label: 'New', short: 'New', tone: 'default' },
  { key: 'CONTACTED', label: 'Contacted', short: 'Contacted', tone: 'default' },
  { key: 'INTERESTED', label: 'Interested', short: 'Interested', tone: 'engaged' },
  { key: 'VISIT_SCHEDULED', label: 'Visit scheduled', short: 'Visit sched.', tone: 'engaged' },
  { key: 'VISITED', label: 'Visited', short: 'Visited', tone: 'engaged' },
  { key: 'TRIAL', label: 'Trial', short: 'Trial', tone: 'hot' },
  { key: 'NEGOTIATION', label: 'Negotiation', short: 'Negotiation', tone: 'hot' },
  { key: 'WON', label: 'Won', short: 'Won', isWon: true, tone: 'success' },
  { key: 'LOST', label: 'Lost', short: 'Lost', isLost: true, tone: 'danger' },
  { key: 'DO_NOT_DISTURB', label: 'Do Not Disturb', short: 'DND', tone: 'danger' },
  { key: 'NOT_INTERESTED', label: 'Not Interested', short: 'Not interested', tone: 'danger' }
]

const STAGE_MAP = new Map<StageKey, StageConfig>(STAGES.map((s) => [s.key, s]))

export function stageConfig(key: StageKey): StageConfig {
  return STAGE_MAP.get(key)!
}

export function isTerminal(key: StageKey): boolean {
  return !!STAGE_MAP.get(key)?.isWon || !!STAGE_MAP.get(key)?.isLost
}

/** Every non-terminal stage a lead can be moved to (strict-move dialog). */
export function moveableStages(from: StageKey): StageConfig[] {
  return STAGES.filter((s) => !isTerminal(s.key) && s.key !== from)
}

/** The first non-terminal stage after `from` in the pipeline, if any. */
export function nextStage(from: StageKey): StageKey | undefined {
  const idx = STAGES.findIndex((s) => s.key === from)
  return STAGES.slice(idx + 1).find((s) => !isTerminal(s.key))?.key
}

export const SOURCES: Record<SourceKey, string> = {
  WALK_IN: 'Walk-in',
  PHONE: 'Phone',
  REFERRAL: 'Referral',
  INSTAGRAM: 'Instagram',
  WEBSITE: 'Website',
  ADVERTISEMENT: 'Advertisement',
  MEMBER_REFERRAL: 'Existing member referral',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Other'
}

/** Normalise a raw captured source label to a canonical key (data hygiene). */
export function normalizeSource(raw: string): SourceKey {
  const r = raw.trim().toLowerCase()
  if (r.includes('walk') || r.includes('walkin')) return 'WALK_IN'
  if (r.includes('insta') || r.includes('ig')) return 'INSTAGRAM'
  if (r.includes('web') || r.includes('site') || r.includes('form')) return 'WEBSITE'
  if (r.includes('member') || r.includes('refer')) return 'MEMBER_REFERRAL'
  if (r.includes('refer')) return 'REFERRAL'
  if (r.includes('whatsapp')) return 'WHATSAPP'
  if (r.includes('ad') || r.includes('fb') || r.includes('facebook')) return 'ADVERTISEMENT'
  if (r.includes('phone') || r.includes('call')) return 'PHONE'
  return 'OTHER'
}

export const ACTIVITY_LABELS: Record<ActivityTypeKey, string> = {
  LEAD_CREATED: 'Lead created',
  PHONE_CALL: 'Phone call',
  WALK_IN: 'Walk-in',
  WHATSAPP: 'WhatsApp',
  GYM_TOUR: 'Gym tour',
  TRIAL: 'Trial session',
  NO_SHOW: 'No-show',
  PRICE_DISCUSSION: 'Price discussion',
  MEMBERSHIP_PROPOSAL: 'Membership proposal',
  OWNER_CHANGE: 'Owner changed',
  STAGE_CHANGE: 'Stage changed',
  FOLLOW_UP_CREATED: 'Follow-up scheduled',
  FOLLOW_UP_DONE: 'Follow-up done',
  NOTE: 'Note',
  LOST: 'Lead lost',
  WON: 'Lead won'
}

export const LOST_REASONS: Record<LostReasonKey, string> = {
  TOO_EXPENSIVE: 'Too expensive',
  JOINED_COMPETITOR: 'Joined a competitor',
  NOT_INTERESTED: 'Not interested',
  NO_RESPONSE: 'No response',
  MOVED_AWAY: 'Moved away',
  MEDICAL: 'Medical reason',
  WRONG_CONTACT: 'Wrong contact details',
  OTHER: 'Other'
}

/** Apply list filters (shared by the table, board and metrics). */
export function filterLeads(leads: Lead[], filters: LeadFilters): Lead[] {
  const now = Date.now()
  const cutoff =
    filters.range === 'today'
      ? now - 24 * 3600 * 1000
      : filters.range === 'week'
        ? now - 7 * 24 * 3600 * 1000
        : filters.range === 'month'
          ? now - 30 * 24 * 3600 * 1000
          : 0

  const q = filters.search?.trim().toLowerCase() ?? ''
  return leads.filter((l) => {
    if (toUTCDate(l.createdAt).getTime() < cutoff) return false
    if (filters.stage && filters.stage !== 'ALL' && l.stage !== filters.stage) return false
    if (filters.sourceId && filters.sourceId !== 'ALL' && l.sourceId !== filters.sourceId)
      return false
    if (filters.ownerId && filters.ownerId !== 'ALL' && l.owner?.id !== filters.ownerId)
      return false
    if (filters.personStatus && filters.personStatus !== 'ALL') {
      const isBlacklisted = filters.personStatus === 'BLACKLISTED'
      if (l.isBlacklisted !== isBlacklisted) return false
    }
    if (q) {
      const hay = [l.name, l.phone, l.email].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function sortLeads(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const order = (k: StageKey): string => STAGE_MAP.get(k)!.label
    const d = order(a.stage).localeCompare(order(b.stage))
    return d !== 0 ? d : toUTCDate(b.createdAt).getTime() - toUTCDate(a.createdAt).getTime()
  })
}

/**
 * Parse a datetime string from SQLite's `datetime('now')` as UTC.
 * SQLite stores UTC without a 'Z' suffix; V8 parses space-separated
 * dates as LOCAL time, so we normalise to force UTC parsing.
 */
function toUTCDate(iso: string): Date {
  if (iso.endsWith('Z') || iso.includes('+')) {
    return new Date(iso)
  }
  return new Date(iso.replace(' ', 'T') + 'Z')
}
