import type { LeadListRow } from '../../../../shared/contracts/sales'
import {
  activityTypeKeyFromName,
  lostReasonKeyFromName,
  sourceKeyFromName,
  stageKeyFromName
} from './reference-data'
import type { Lead } from './types'

/**
 * Hydrates a `leads:list` row (flat + nested IPC shape) into the renderer's
 * display model. Backend names are resolved to canonical keys through the
 * reference-data vocabulary; anything unrecognized falls back to a safe key so
 * unknown admin-edited values never crash the UI.
 */
export function mapLeadRow(row: LeadListRow): Lead {
  return {
    id: row.id,
    personId: row.personId,
    name: row.personName,
    phone: row.phone,
    email: row.email ?? undefined,
    isBlacklisted: row.isBlacklisted,
    blacklistedReason: row.blacklistedReason ?? undefined,
    source: row.sourceName ? sourceKeyFromName(row.sourceName) : 'OTHER',
    sourceId: row.sourceId,
    owner: row.ownerUserId
      ? { id: row.ownerUserId, name: row.ownerName ?? 'Unassigned' }
      : undefined,
    stage: row.stageName ? stageKeyFromName(row.stageName) : 'NEW',
    stageId: row.stageId,
    createdAt: row.createdAt,
    customerId: row.customerId ?? undefined,
    planId: row.planId ?? undefined,
    planName: row.planName ?? undefined,
    goal: row.goal ?? undefined,
    notes: row.notes ?? undefined,
    lostReason: row.lostReasonId ? lostReasonKeyFromName(row.lostReasonName ?? '') : undefined,
    lostAt: row.lostAt ?? undefined,
    activities: row.activities.map((a) => ({
      id: a.id,
      leadId: row.id,
      type: activityTypeKeyFromName(a.typeName),
      note: a.note ?? undefined,
      at: a.occurredAt,
      by: a.createdByName ?? undefined
    })),
    followUps: row.followUps.map((f) => ({
      id: f.id,
      leadId: row.id,
      title: f.title,
      dueAt: f.dueAt,
      extensionReason: f.extensionReason ?? undefined,
      notes: f.notes ?? undefined,
      completedAt: f.completedAt ?? undefined,
      cancelledAt: f.cancelledAt ?? undefined
    })),
    stageHistory: row.stageHistory.map((h) => ({
      from: h.fromStageName ? stageKeyFromName(h.fromStageName) : undefined,
      to: stageKeyFromName(h.toStageName),
      at: h.changedAt
    }))
  }
}
