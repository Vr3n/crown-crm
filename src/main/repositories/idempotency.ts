import { and, eq } from 'drizzle-orm'
import { getDrizzle } from '../db/connection'
import { idempotencyKeys } from '../db/schema'

export const idempotencyRepo = {
  find(
    companyId: number,
    channel: string,
    key: string
  ): { key: string; response: string | null } | null {
    const row = getDrizzle()
      .select({ key: idempotencyKeys.key, response: idempotencyKeys.response })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.company_id, companyId),
          eq(idempotencyKeys.channel, channel),
          eq(idempotencyKeys.key, key)
        )
      )
      .get() as { key: string; response: string | null } | undefined
    return row ?? null
  },

  insert(companyId: number, channel: string, key: string, response: string): void {
    getDrizzle()
      .insert(idempotencyKeys)
      .values({ company_id: companyId, channel, key, response })
      .run()
  }
}
