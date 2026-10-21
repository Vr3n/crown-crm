import { and, eq } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { idempotencyKeys } from '../db/schema'

export const idempotencyRepo = {
  find(organizationId: number, key: string): { key: string; response: string | null } | null {
    const row = getDrizzle()
      .select({ key: idempotencyKeys.key, response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.organization_id, organizationId), eq(idempotencyKeys.key, key)))
      .get() as { key: string; response: string | null } | undefined
    return row ?? null
  },

  insert(organizationId: number, key: string, response: string): void {
    getDrizzle()
      .insert(idempotencyKeys)
      .values({ organization_id: organizationId, key, response })
      .run()
  }
}
