import { shell } from 'electron'

/**
 * Shows a saved export in the file manager with the file selected. A missing
 * folder or a machine without a file manager must never turn a successful save
 * into an error, so the call is best effort.
 */
export function revealSavedFile(filePath: string): void {
  try {
    shell.showItemInFolder(filePath)
  } catch {
    // Nothing to recover: the file is already on disk.
  }
}
