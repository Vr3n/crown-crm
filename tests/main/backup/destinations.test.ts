import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import {
  addDestination,
  copyToFolders,
  listDestinations,
  normalizeFolder,
  readDestinations,
  removeDestination,
  sameFolder
} from '../../../src/main/backup/destinations'

const dirs: string[] = []

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'crown-backup-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true })
  }
})

describe('normalizeFolder', () => {
  it('trims whitespace and a trailing separator', () => {
    const base = tempDir()
    expect(normalizeFolder(`  ${base}${sep}  `)).toBe(resolve(base))
  })

  it('keeps a Windows drive root intact', () => {
    if (process.platform !== 'win32') return
    expect(normalizeFolder('C:\\')).toBe('C:\\')
  })

  it('rejects an empty path', () => {
    expect(() => normalizeFolder('   ')).toThrow(/folder/i)
  })
})

describe('sameFolder', () => {
  it('ignores case and a trailing separator', () => {
    const base = tempDir()
    expect(sameFolder(base, `${base.toUpperCase()}${sep}`)).toBe(true)
  })

  it('separates two different folders', () => {
    expect(sameFolder(tempDir(), tempDir())).toBe(false)
  })
})

describe('readDestinations', () => {
  it('returns an empty list when nothing has been saved', () => {
    expect(readDestinations(tempDir())).toEqual([])
  })

  it('survives a corrupt settings file instead of crashing the page', () => {
    const base = tempDir()
    writeFileSync(join(base, 'backup-destinations.json'), '{not json', 'utf8')
    expect(readDestinations(base)).toEqual([])
  })
})

describe('addDestination', () => {
  it('persists a folder and reports it as available', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    const extra = tempDir()
    mkdirSync(primary, { recursive: true })

    const result = addDestination(base, extra, primary)

    expect(result.primary).toBe(primary)
    expect(result.extras).toEqual([{ path: extra, available: true }])
    expect(readDestinations(base)).toEqual([extra])
    expect(JSON.parse(readFileSync(join(base, 'backup-destinations.json'), 'utf8'))).toEqual([
      extra
    ])
  })

  it('refuses the same folder twice, whatever the casing or trailing slash', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    const extra = tempDir()
    mkdirSync(primary, { recursive: true })

    addDestination(base, extra, primary)
    expect(() => addDestination(base, `${extra}${sep}`, primary)).toThrow(/already/i)
  })

  it('refuses the primary folder as an extra destination', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    mkdirSync(primary, { recursive: true })

    expect(() => addDestination(base, primary, primary)).toThrow(/primary/i)
  })

  it('refuses a folder that does not exist', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    mkdirSync(primary, { recursive: true })

    expect(() => addDestination(base, join(base, 'nope'), primary)).toThrow(/does not exist/i)
  })

  it('marks an unplugged destination as unavailable', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    const extra = tempDir()
    mkdirSync(primary, { recursive: true })
    addDestination(base, extra, primary)

    rmSync(extra, { recursive: true, force: true })

    expect(listDestinations(base, primary).extras).toEqual([{ path: extra, available: false }])
  })
})

describe('removeDestination', () => {
  it('drops a folder from the settings file', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    const extra = tempDir()
    mkdirSync(primary, { recursive: true })
    addDestination(base, extra, primary)

    const result = removeDestination(base, extra, primary)

    expect(result.extras).toEqual([])
    expect(readDestinations(base)).toEqual([])
  })

  it('never removes the primary folder', () => {
    const base = tempDir()
    const primary = join(base, 'backups')
    mkdirSync(primary, { recursive: true })

    expect(() => removeDestination(base, primary, primary)).toThrow(/primary/i)
  })
})

describe('copyToFolders', () => {
  it('writes the same file name into every folder', () => {
    const base = tempDir()
    const source = join(base, 'crown-books.db')
    writeFileSync(source, 'books', 'utf8')
    const first = tempDir()
    const second = tempDir()

    const copies = copyToFolders(source, [first, second], 'crown-books-1.db')

    expect(copies).toEqual([
      { path: first, ok: true },
      { path: second, ok: true }
    ])
    expect(readFileSync(join(first, 'crown-books-1.db'), 'utf8')).toBe('books')
    expect(readFileSync(join(second, 'crown-books-1.db'), 'utf8')).toBe('books')
  })

  it('reports a failing folder and still copies the rest', () => {
    const base = tempDir()
    const source = join(base, 'crown-books.db')
    writeFileSync(source, 'books', 'utf8')
    const good = tempDir()
    const missing = join(base, 'unplugged')

    const copies = copyToFolders(source, [missing, good], 'crown-books-2.db')

    expect(copies).toHaveLength(2)
    expect(copies[0]).toMatchObject({ path: missing, ok: false })
    expect(copies[0]?.error).toMatch(/not available/i)
    expect(copies[1]).toEqual({ path: good, ok: true })
    expect(readFileSync(join(good, 'crown-books-2.db'), 'utf8')).toBe('books')
  })
})
