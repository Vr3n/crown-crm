/**
 * Licensing contracts — shared between main, preload, and renderer.
 *
 * The machine install lock binds a CrownCRM install to the PC it was
 * installed on. The renderer only ever asks whether the current machine
 * matches the lock (ACTIVE) or not (LOCKED). There is no activation, no
 * license content, and no vendor hand-off.
 */

export type LicenseState = 'ACTIVE' | 'LOCKED'

export type LicenseReason = 'NO_LOCK' | 'FINGERPRINT_MISMATCH' | 'CORRUPT'

export interface LicenseStatus {
  state: LicenseState
  reason?: LicenseReason
}
