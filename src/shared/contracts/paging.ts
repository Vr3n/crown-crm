import { z } from 'zod'

/**
 * Paging conventions for list queries. `page`/`limit` (1-based) is the default
 * for local, indexed lists; `cursor` is available for large/streaming read
 * models that need stable position. Responses always carry `total` and
 * `hasMore` so the renderer can drive pagination without extra round-trips.
 */
export const pageRequestSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(200).default(50)
})

export const cursorPageRequestSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50)
})

export type PageRequest = z.infer<typeof pageRequestSchema>
export type CursorPageRequest = z.infer<typeof cursorPageRequestSchema>

export interface Paged<T> {
  items: T[]
  page: number
  limit: number
  total: number
  hasMore: boolean
}

export interface CursorPaged<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}
