import { shell } from 'electron'

/**
 * Opens a backup folder in the file manager. An unplugged drive or a machine
 * without a file manager must not surface as an error: the folder list already
 * shows whether the destination is available.
 */
export async function openFolder(folder: string): Promise<void> {
  try {
    await shell.openPath(folder)
  } catch {
    // Nothing to recover.
  }
}
