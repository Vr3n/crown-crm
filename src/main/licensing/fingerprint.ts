import { execFileSync } from 'node:child_process'

/**
 * Machine fingerprint — the Windows MachineGuid.
 *
 * MachineGuid is a per-Windows-installation UUID stored in
 * `HKLM\SOFTWARE\Microsoft\Cryptography`. It is:
 *   - unique per machine (a fresh install generates a new UUID),
 *   - fast and reliable to read via `reg.exe` (no PowerShell / WMI, no 5s
 *     WMI-timeout risk),
 *   - stable across hardware changes (survives disk/CPU/motherboard swaps
 *     while Windows itself is unchanged).
 *
 * It is the single identity the install lock binds to.
 */

let cachedMachineGuid: string | null = null

/** Clear the cached value so the next call re-reads the registry. */
export function resetFingerprintCache(): void {
  cachedMachineGuid = null
}

/** Normalize a MachineGuid for comparison (trim + lowercase). */
export function normalizeMachineGuid(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Read the current machine's MachineGuid from the registry via `reg.exe`.
 * Throws if it cannot be determined.
 */
export function collectMachineGuid(): string {
  if (cachedMachineGuid) return cachedMachineGuid
  const output = execFileSync(
    'reg.exe',
    ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
    { encoding: 'utf-8', windowsHide: true, timeout: 5000 }
  )
  const match = output.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
  )
  if (!match) {
    throw new Error('MachineGuid not found in registry output')
  }
  cachedMachineGuid = normalizeMachineGuid(match[0])
  return cachedMachineGuid
}
