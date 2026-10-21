import { logger } from '../lib/logger'
import { lockExists, generateInstallLock, getInstallDir } from './install-lock'

/**
 * First-run / install binding bootstrap.
 *
 * On a properly installed app the lock was already written to the install
 * directory by the NSIS installer (`--generate-binding`, elevated). This is a
 * no-op in that case. If the lock is somehow missing (e.g. the installer step
 * was skipped), we attempt to generate it here as a best-effort safety net.
 *
 * Failures are non-fatal: the error is logged and startup continues;
 * `verifyInstallLock` will report LOCKED and `LicenseGate` shows the blocked
 * screen.
 */
export function ensureInstallLock(): void {
  const installDir = getInstallDir()

  if (lockExists(installDir)) return

  try {
    generateInstallLock(installDir)
    logger.info('install lock generated')
  } catch (err) {
    logger.error('failed to generate install lock', { error: String(err) })
  }
}
