import { z } from 'zod'

/** Result of copying one backup file into one folder. */
export interface BackupCopy {
  path: string
  ok: boolean
  error?: string
}

export interface BackupFile {
  name: string
  sizeBytes: number
  createdAt: string
  /**
   * One entry per folder, in the order the copies were attempted. The primary
   * folder is always first. Older backups read from disk do not carry this.
   */
  copies?: BackupCopy[]
}

export interface BackupDestination {
  path: string
  /** False when the folder is gone or an external drive is unplugged. */
  available: boolean
}

export interface BackupDestinations {
  /** The folder next to the database. It is always written and cannot be removed. */
  primary: string
  extras: BackupDestination[]
}

export const backupPathInputSchema = z.object({
  path: z.string().min(1).max(500)
})

export type BackupPathInput = z.infer<typeof backupPathInputSchema>
