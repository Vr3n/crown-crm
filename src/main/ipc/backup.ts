import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getDb } from '../db/connection'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { handle } from './handle'

export interface BackupFile {
  name: string
  sizeBytes: number
  createdAt: string
}

function backupDir(): string {
  const dir = join(app.getPath('userData'), 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Copies the live SQLite file into the user's backup folder after a WAL
 * checkpoint. Restore is deliberately not automated: replacing a live database
 * needs the app closed, so it stays a manual, documented operation.
 */
export function registerBackupIpc(): void {
  handle(IPC_CHANNELS.BACKUP_CREATE, (): BackupFile => {
    requirePermission(PERMISSIONS.BACKUP_MANAGE)
    getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const source = join(app.getPath('userData'), 'crown-books.db')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `crown-books-${stamp}.db`
    const target = join(backupDir(), name)
    copyFileSync(source, target)
    const stat = statSync(target)
    return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() }
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
}
