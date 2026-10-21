import { queryOptions, useQuery } from '@tanstack/react-query'
import type { ReferenceData } from '../../../../shared/contracts/sales'
import { api } from './api'
import { LOST_REASONS, normalizeSource, SOURCES } from './constants'
import type { ActivityTypeKey, LostReasonKey, SourceKey, StageKey } from './types'

export const referenceKeys = {
  all: ['reference-data'] as const
}

/**
 * Reference data is the org's configurable vocabulary (sources, stages, lost
 * reasons, activity types) — the backend seeds it during org setup. Forms render
 * their options from here instead of hard-coded lists, so admin edits flow
 * through automatically.
 *
 * Note the key lives OUTSIDE `['leads']`: lead mutations invalidate the `leads`
 * prefix on every write, but this vocabulary changes rarely — giving it a
 * standalone key with a long freshness window avoids refetching it on every
 * stage move or activity log.
 */
export const referenceDataOptions = queryOptions({
  queryKey: referenceKeys.all,
  queryFn: () => api.referenceData(),
  staleTime: 5 * 60_000
})

export function useReferenceData(): ReturnType<typeof useQuery<ReferenceData, Error>> {
  return useQuery(referenceDataOptions)
}

export interface LeadMaps {
  sourceIdByName: Map<string, number>
  sourceNameById: Map<number, string>
  stageIdByKey: Map<StageKey, number>
  stageNameById: Map<number, string>
  lostReasonIdByName: Map<string, number>
  lostReasonNameById: Map<number, string>
  activityTypeIdByName: Map<string, number>
  activityTypeNameById: Map<number, string>
}

const norm = (s: string): string => s.trim().toLowerCase()

/** Build the bidirectional id ↔ name maps used to hydrate lead rows and forms. */
export function getLeadMaps(ref: ReferenceData): LeadMaps {
  const sourceIdByName = new Map<string, number>()
  const sourceNameById = new Map<number, string>()
  for (const s of ref.sources) {
    sourceIdByName.set(norm(s.name), s.id)
    sourceNameById.set(s.id, s.name)
  }

  const stageIdByKey = new Map<StageKey, number>()
  const stageNameById = new Map<number, string>()
  for (const s of ref.stages) {
    stageIdByKey.set(s.name as StageKey, s.id)
    stageNameById.set(s.id, s.name)
  }

  const lostReasonIdByName = new Map<string, number>()
  const lostReasonNameById = new Map<number, string>()
  for (const r of ref.lostReasons) {
    lostReasonIdByName.set(norm(r.name), r.id)
    lostReasonNameById.set(r.id, r.name)
  }

  const activityTypeIdByName = new Map<string, number>()
  const activityTypeNameById = new Map<number, string>()
  for (const t of ref.activityTypes) {
    activityTypeIdByName.set(norm(t.name), t.id)
    activityTypeNameById.set(t.id, t.name)
  }

  return {
    sourceIdByName,
    sourceNameById,
    stageIdByKey,
    stageNameById,
    lostReasonIdByName,
    lostReasonNameById,
    activityTypeIdByName,
    activityTypeNameById
  }
}

const STAGE_KEYS = new Set<StageKey>([
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'VISIT_SCHEDULED',
  'VISITED',
  'TRIAL',
  'NEGOTIATION',
  'WON',
  'LOST',
  'DO_NOT_DISTURB',
  'NOT_INTERESTED'
])

function isStageKey(name: string): name is StageKey {
  return STAGE_KEYS.has(name as StageKey)
}

/** Backend stage names are the StageKeys themselves. */
export function stageKeyFromName(name: string): StageKey {
  return isStageKey(name) ? name : 'NEW'
}

export function stageIdOf(maps: LeadMaps, key: StageKey): number | undefined {
  return maps.stageIdByKey.get(key)
}

/** Resolve a backend source name to its canonical key (label match, then hygiene). */
export function sourceKeyFromName(name: string): SourceKey {
  const match = (Object.keys(SOURCES) as SourceKey[]).find(
    (key) => norm(SOURCES[key]) === norm(name)
  )
  return match ?? normalizeSource(name)
}

/** Resolve a backend lost-reason name to its canonical key (label match, else OTHER). */
export function lostReasonKeyFromName(name: string): LostReasonKey {
  const match = (Object.keys(LOST_REASONS) as LostReasonKey[]).find(
    (key) => norm(LOST_REASONS[key]) === norm(name)
  )
  return match ?? 'OTHER'
}

const ACTIVITY_TYPE_KEYS = new Set<ActivityTypeKey>([
  'LEAD_CREATED',
  'PHONE_CALL',
  'WALK_IN',
  'WHATSAPP',
  'GYM_TOUR',
  'TRIAL',
  'NO_SHOW',
  'PRICE_DISCUSSION',
  'MEMBERSHIP_PROPOSAL',
  'OWNER_CHANGE',
  'STAGE_CHANGE',
  'FOLLOW_UP_CREATED',
  'FOLLOW_UP_DONE',
  'NOTE',
  'LOST',
  'WON'
])

/** Resolve a backend activity-type name to a canonical key (names are the keys). */
export function activityTypeKeyFromName(name: string): ActivityTypeKey {
  return ACTIVITY_TYPE_KEYS.has(name as ActivityTypeKey) ? (name as ActivityTypeKey) : 'NOTE'
}
