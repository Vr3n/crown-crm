import { and, asc, eq } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { auditEvents, users } from '../db/schema'

export interface AuditEntry {
  id: number
  action: string
  actorUserId: number | null
  actorName: string | null
  actorEmail: string | null
  beforeJson: string | null
  afterJson: string | null
  createdAt: string
}

/**
 * Append-only audit trail shared by access management and vouchers. Callers
 * pass plain objects; passwords and hashes must never be included.
 */
export const auditRepo = {
  record(input: {
    companyId: number
    entity: string
    entityId: number
    action: string
    before?: unknown
    after?: unknown
    actorUserId: number | null
  }): void {
    getDrizzle()
      .insert(auditEvents)
      .values({
        company_id: input.companyId,
        entity: input.entity,
        entity_id: input.entityId,
        action: input.action,
        before_json: input.before === undefined ? null : JSON.stringify(input.before),
        after_json: input.after === undefined ? null : JSON.stringify(input.after),
        actor_user_id: input.actorUserId
      })
      .run()
  },

  list(companyId: number, entity: string, entityId: number): AuditEntry[] {
    return getDrizzle()
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        actorUserId: auditEvents.actor_user_id,
        actorName: users.full_name,
        actorEmail: users.email,
        beforeJson: auditEvents.before_json,
        afterJson: auditEvents.after_json,
        createdAt: auditEvents.created_at
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actor_user_id))
      .where(
        and(
          eq(auditEvents.company_id, companyId),
          eq(auditEvents.entity, entity),
          eq(auditEvents.entity_id, entityId)
        )
      )
      .orderBy(asc(auditEvents.id))
      .all()
  }
}
