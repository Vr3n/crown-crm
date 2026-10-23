import { describe, expect, it } from 'vitest'
import {
  MAX_RECENTS,
  RECENTS_KEY,
  clearRecents,
  readRecents,
  rememberRecent,
  type RecentSearch
} from '../../src/renderer/src/features/search/recent-searches'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, value)
  }
}

function entry(path: string, title = path): RecentSearch {
  return { key: path, kind: 'PARTY', title, subtitle: null, path }
}

describe('recent searches', () => {
  it('round-trips entries', () => {
    const storage = memoryStorage()
    rememberRecent(storage, entry('/parties/1', 'Acme'))
    expect(readRecents(storage)).toEqual([entry('/parties/1', 'Acme')])
  })

  it('moves an existing path to the front and de-duplicates', () => {
    const storage = memoryStorage()
    rememberRecent(storage, entry('/parties/1', 'Acme'))
    rememberRecent(storage, entry('/items/2', 'Bracket'))
    const rows = rememberRecent(storage, entry('/parties/1', 'Acme Traders'))
    expect(rows.map((row) => row.path)).toEqual(['/parties/1', '/items/2'])
    expect(rows[0].title).toBe('Acme Traders')
  })

  it('caps the list', () => {
    const storage = memoryStorage()
    for (let index = 0; index < MAX_RECENTS + 3; index += 1) {
      rememberRecent(storage, entry(`/parties/${index}`))
    }
    expect(readRecents(storage)).toHaveLength(MAX_RECENTS)
  })

  it('ignores corrupt storage and clears cleanly', () => {
    const storage = memoryStorage()
    storage.setItem(RECENTS_KEY, '{not json')
    expect(readRecents(storage)).toEqual([])

    rememberRecent(storage, entry('/parties/1'))
    clearRecents(storage)
    expect(readRecents(storage)).toEqual([])
  })
})
