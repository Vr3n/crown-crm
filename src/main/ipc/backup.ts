import { BrowserWindow, app, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db/connection'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import {
  backupPathInputSchema,
  type BackupCopy,
  type BackupDestinations,
  type BackupFile
} from '../../shared/contracts/backup'
import { requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import {
  addDestination,
  copyToFolders,
  listDestinations,
  readDestinations,
  removeDestination
} from '../backup/destinations'
import { openFolder } from '../backup/reveal'
import { handle } from './handle'

/** The folder next to the database. Always written, never removable. */
function backupDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Destinations are a machine setting, so they live next to the database. */
function settingsDir(): string {
  return app.getPath('userData')
}

function destinations(): BackupDestinations {
  return listDestinations(settingsDir(), backupDir())
}

/**
 * Copies the live SQLite file into the primary folder and every configured
 * destination after a WAL checkpoint. The primary copy must succeed: without it
 * there is no backup at all. Extra folders are independent, so an unplugged
 * drive is reported and the other copies still happen.
 *
 * Restore is deliberately not automated: replacing a live database needs the
 * app closed, so it stays a manual, documented operation.
 */
export function registerBackupIpc(): void {
  handle(IPC_CHANNELS.BACKUP_CREATE, (): BackupFile => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const source = join(app.getPath('userData'), 'crown-books.db')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `crown-books-${stamp}.db`

    const primary = backupDir()
    const target = join(primary, name)
    copyFileSync(source, target)
    const stat = statSync(target)

    const copies: BackupCopy[] = [{ path: primary, ok: true }]
    for (const copy of copyToFolders(source, readDestinations(settingsDir()), name)) {
      copies.push(copy)
    }

    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString(), copies }
  })

  handle(IPC_CHANNELS.BACKUP_LIST, (): BackupFile[] => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    const dir = backupDir()
    return readdirSync(dir)
      .filter((name) => name.endsWith('.db'))
      .map((name) => {
        const stat = statSync(join(dir, name))
        return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  })

  handle(IPC_CHANNELS.BACKUP_DESTINATIONS, (): BackupDestinations => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    return destinations()
  })

  /**
   * Adding uses the native folder picker so the user cannot type a path that
   * does not exist. A cancelled dialog resolves to null, not an error.
   */
  handle(IPC_CHANNELS.BACKUP_ADD_DESTINATION, async (): Promise<BackupDestinations | null> => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a backup folder',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const folder = picked.filePaths[0]
    if (picked.canceled || !folder) return null
    return addDestination(settingsDir(), folder, backupDir())
  })

  handle(
    IPC_CHANNELS.BACKUP_REMOVE_DESTINATION,
    backupPathInputSchema,
    ({ path }): BackupDestinations => {
      requirePermission(PERMISSIONS.BACKUP_MANAGE)
      return removeDestination(settingsDir(), path, backupDir())
    }
  )

  handle(IPC_CHANNELS.BACKUP_REVEAL, backupPathInputSchema, async ({ path }): Promise<void> => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    if (!existsSync(path)) throw new Error('That folder is not available right now.')
    await openFolder(path)
  })
}
