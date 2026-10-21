/**
 * Lead-management domain types (Module 01 — Sales / CRM).
 *
 * These mirror the domain shapes from docs/01-people-leads-sales.md: a Lead is
 * a sales opportunity for a Person, distinct from Note / Follow-up / Activity.
 * Stages are config-driven (see constants.ts) — logic only reads the
 * `isWon` / `isLost` flags, never the literal stage name.
 *
 * The display model below is hydrated by `mapLeadRow` from the `leads:list`
 * IPC rows plus the org's reference data (ids ↔ keys resolved via
 * `getLeadMaps`). All ids are the real SQLite integer ids.
 */
import type { PersonStatus } from '../people/person-status'

export type StageKey =
  | 'NEW'
  | 'CONTACTED'
  | 'INTERESTED'
  | 'VISIT_SCHEDULED'
  | 'VISITED'
  | 'TRIAL'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST'
  | 'DO_NOT_DISTURB'
  | 'NOT_INTERESTED'

export interface StageConfig {
  key: StageKey
  label: string
  /** Short column header used on the board. */
  short: string
  isWon?: boolean
  isLost?: boolean
  /** Tint used for the stage pill / board column accent. */
  tone: 'default' | 'engaged' | 'hot' | 'success' | 'danger'
}

export type SourceKey =
  | 'WALK_IN'
  | 'PHONE'
  | 'REFERRAL'
  | 'INSTAGRAM'
  | 'WEBSITE'
  | 'ADVERTISEMENT'
  | 'MEMBER_REFERRAL'
  | 'WHATSAPP'
  | 'OTHER'

export type ActivityTypeKey =
  | 'LEAD_CREATED'
  | 'PHONE_CALL'
  | 'WALK_IN'
  | 'WHATSAPP'
  | 'GYM_TOUR'
  | 'TRIAL'
  | 'NO_SHOW'
  | 'PRICE_DISCUSSION'
  | 'MEMBERSHIP_PROPOSAL'
  | 'OWNER_CHANGE'
  | 'STAGE_CHANGE'
  | 'FOLLOW_UP_CREATED'
  | 'FOLLOW_UP_DONE'
  | 'NOTE'
  | 'LOST'
  | 'WON'

export type LostReasonKey =
  | 'TOO_EXPENSIVE'
  | 'JOINED_COMPETITOR'
  | 'NOT_INTERESTED'
  | 'NO_RESPONSE'
  | 'MOVED_AWAY'
  | 'MEDICAL'
  | 'WRONG_CONTACT'
  | 'OTHER'

export interface OwnerRef {
  id: number
  name: string
}

export interface FollowUp {
  id: number
  leadId: number
  title: string
  dueAt: string
  extensionReason?: string
  notes?: string
  completedAt?: string
  cancelledAt?: string
  cancelledReason?: string
}

export interface LeadActivity {
  id: number
  leadId: number
  type: ActivityTypeKey
  note?: string
  at: string
  by?: string
}

export interface LeadStageHistoryEntry {
  from?: StageKey
  to: StageKey
  at: string
  by?: string
}

export interface Lead {
  id: number
  personId: number
  name: string
  phone?: string
  email?: string
  /** Person-level flag — blacklisted people cannot be sold/renewed. */
  isBlacklisted: boolean
  blacklistedReason?: string
  /** Canonical source key. */
  source: SourceKey
  sourceId: number
  owner?: OwnerRef
  stage: StageKey
  stageId: number
  createdAt: string
  /** Customer created when this lead sold a membership (Module 02). */
  customerId?: number
  /** The catalog plan this lead is interested in (Module 03 FK). */
  planId?: number
  planName?: string
  goal?: string
  notes?: string
  lostReason?: LostReasonKey
  lostAt?: string
  activities: LeadActivity[]
  followUps: FollowUp[]
  stageHistory: LeadStageHistoryEntry[]
}

/** Renderer-side create input; `phone` is mandatory (backend enforces the format). */
export interface NewLeadInput {
  fullName: string
  phone: string
  email?: string
  sourceId: number
  planId?: number
  goal?: string
  notes?: string
}

export type LeadFilters = {
  search?: string
  stage?: StageKey | 'ALL'
  sourceId?: number | 'ALL'
  ownerId?: number | 'ALL'
  personStatus?: 'ALL' | PersonStatus
  range: 'today' | 'week' | 'month' | 'all'
}
