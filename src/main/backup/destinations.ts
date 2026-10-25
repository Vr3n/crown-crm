import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  BackupCopy,
  BackupDestination,
  BackupDestinations
} from '../../shared/contracts/backup'

const FILE = 'backup-destinations.json'

/**
 * Backup destinations are a machine setting, not business data, so they live in
 * a small JSON file next to the database rather than in a table that the backup
 * itself would then contain.
 */
export function normalizeFolder(folder: string): string {
  const trimmed = folder.trim()
  if (!trimmed) throw new Error('Choose a folder first.')
  const resolved = resolve(trimmed)
  // Keep a drive root intact: "C:\" must not become "C:".
  return resolved.length > 3 ? resolved.replace(/[\\/]+$/, '') : resolved
}

export function sameFolder(a: string, b: string): boolean {
  return normalizeFolder(a).toLowerCase() === normalizeFolder(b).toLowerCase()
}

export function readDestinations(baseDir: string): string[] {
  const file = join(baseDir, FILE)
  if (!existsSync(file)) return []
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim() !== ''
    )
  } catch {
    return []
  }
}

function writeDestinations(baseDir: string, folders: string[]): void {
  writeFileSync(join(baseDir, FILE), JSON.stringify(folders, null, 2), 'utf8')
}

export function listDestinations(baseDir: string, primaryDir: string): BackupDestinations {
  const extras: BackupDestination[] = readDestinations(baseDir).map((path) => ({
    path,
    available: existsSync(path)
  }))
  return { primary: primaryDir, extras }
}

export function addDestination(
  baseDir: string,
  folder: string,
  primaryDir: string
): BackupDestinations {
  const normalized = normalizeFolder(folder)
  if (!existsSync(normalized)) throw new Error('That folder does not exist.')
  if (sameFolder(normalized, primaryDir)) {
    throw new Error('The primary backup folder is already included.')
  }

  const current = readDestinations(baseDir)
  if (current.some((entry) => sameFolder(entry, normalized))) {
    throw new Error('That folder is already a backup destination.')
  }

  writeDestinations(baseDir, [...current, normalized])
  return listDestinations(baseDir, primaryDir)
}

export function removeDestination(
  baseDir: string,
  folder: string,
  primaryDir: string
): BackupDestinations {
  const normalized = normalizeFolder(folder)
  if (sameFolder(normalized, primaryDir)) {
    throw new Error('The primary backup folder cannot be removed.')
  }
  const remaining = readDestinations(baseDir).filter((entry) => !sameFolder(entry, normalized))
  writeDestinations(baseDir, remaining)
  return listDestinations(baseDir, primaryDir)
}

/**
 * Copies one backup to every folder. Each folder is independent: an unplugged
 * drive is reported and the other copies still happen.
 */
export function copyToFolders(source: string, folders: string[], name: string): BackupCopy[] {
  return folders.map((folder) => {
    try {
      if (!existsSync(folder)) throw new Error('Folder is not available')
      mkdirSync(folder, { recursive: true })
      copyFileSync(source, join(folder, name))
      return { path: folder, ok: true }
    } catch (error) {
      return {
        path: folder,
        ok: false,
        error: error instanceof Error ? error.message : 'Could not copy the backup'
      }
    }
  })
}
