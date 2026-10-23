import type { SearchKind } from '../../../../shared/contracts/search'

export const RECENTS_KEY = 'crownbooks:recent-searches'
export const MAX_RECENTS = 5

export type RecentKind = SearchKind | 'PAGE'

export interface RecentSearch {
  key: string
  kind: RecentKind
  title: string
  subtitle: string | null
  path: string
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function isRecent(value: unknown): value is RecentSearch {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (
    typeof row.key === 'string' &&
    typeof row.kind === 'string' &&
    typeof row.title === 'string' &&
    typeof row.path === 'string' &&
    (row.subtitle === null || typeof row.subtitle === 'string')
  )
}

/** Reads recents defensively: corrupt storage degrades to an empty list. */
export function readRecents(storage: StorageLike): RecentSearch[] {
  try {
    const raw = storage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isRecent).slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

/** Adds a result to the front, de-duplicated by path, and persists it. */
export function rememberRecent(storage: StorageLike, entry: RecentSearch): RecentSearch[] {
  const next = [entry, ...readRecents(storage).filter((row) => row.path !== entry.path)].slice(
    0,
    MAX_RECENTS
  )
  try {
    storage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    // A full or unavailable localStorage should not block navigation.
  }
  return next
}

export function clearRecents(storage: StorageLike): void {
  try {
    storage.removeItem(RECENTS_KEY)
  } catch {
    // Nothing to do: the in-memory list is cleared by the caller.
  }
}
