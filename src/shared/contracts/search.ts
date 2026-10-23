import { z } from 'zod'

/**
 * Global search contract.
 *
 * The query runs in the main process so a result is always scoped to the
 * active company and filtered by the caller's permissions. The renderer only
 * decides how to present and navigate to a result.
 */

export const searchKindSchema = z.enum(['PARTY', 'ITEM', 'VOUCHER', 'ACCOUNT'])
export type SearchKind = z.infer<typeof searchKindSchema>

export const searchInputSchema = z.object({
  query: z.string().trim().min(1).max(120)
})
export type SearchInput = z.infer<typeof searchInputSchema>

export interface SearchResult {
  id: number
  kind: SearchKind
  title: string
  subtitle: string | null
  /** A short right-aligned detail: amount, code, status or date. */
  meta: string | null
}

export interface SearchGroup {
  kind: SearchKind
  label: string
  items: SearchResult[]
}

export interface SearchOutput {
  query: string
  groups: SearchGroup[]
  total: number
}
