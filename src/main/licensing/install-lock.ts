import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { collectMachineGuid, normalizeMachineGuid } from './fingerprint'

/**
 * Machine install lock.
 *
 * Binds a CrownCRM install to the Windows machine it was installed on. A lock
 * file (`machine.lock`) holding the machine's MachineGuid is written to the
 * install directory at install time by the NSIS installer, so it travels with
 * the application folder. At every launch we re-read the current MachineGuid
 * and compare it against the lock; a mismatch means the app was copied to
 * another machine and is refused.
 *
 * No PowerShell/WMI, no signatures, no vendor — a MachineGuid comparison is
 * all that is needed for the casual copy-to-another-PC threat model.
 */

export const INSTALL_LOCK_FILENAME = 'machine.lock'

export type LockState = 'ACTIVE' | 'LOCKED'

export type LockReason = 'NO_LOCK' | 'FINGERPRINT_MISMATCH' | 'CORRUPT'

export interface InstallLockStatus {
  state: LockState
  reason?: LockReason
}

/** The install directory: the folder containing the executable. */
export function getInstallDir(): string {
  return dirname(process.execPath)
}

export function getLockPath(installDir: string): string {
  return join(installDir, INSTALL_LOCK_FILENAME)
}

export function lockExists(installDir: string): boolean {
  return existsSync(getLockPath(installDir))
}

/**
 * Read the lock file's MachineGuid. Returns `null` when the file is missing or
 * empty (corrupt).
 */
export function readLock(installDir: string): string | null {
  const path = getLockPath(installDir)
  if (!existsSync(path)) return null
  const content = readFileSync(path, 'utf-8').trim()
  return content.length > 0 ? content : null
}

/** Write a lock file for the current machine into the install directory. */
export function generateInstallLock(installDir: string): void {
  const guid = collectMachineGuid()
  writeFileSync(getLockPath(installDir), `${guid}\n`, 'utf-8')
}

/**
 * Verify the current machine against the install lock.
 * A missing/corrupt lock or a MachineGuid mismatch refuses to run.
 */
export function verifyInstallLock(installDir: string): InstallLockStatus {
  const lock = readLock(installDir)
  if (!lock) {
    return { state: 'LOCKED', reason: lockExists(installDir) ? 'CORRUPT' : 'NO_LOCK' }
  }

  let current: string
  try {
    current = collectMachineGuid()
  } catch {
    return { state: 'LOCKED', reason: 'FINGERPRINT_MISMATCH' }
  }

  if (normalizeMachineGuid(current) !== normalizeMachineGuid(lock)) {
    return { state: 'LOCKED', reason: 'FINGERPRINT_MISMATCH' }
  }

  return { state: 'ACTIVE' }
}
