/** Local types for the renderer — mirrors the shared contract shapes. */

export type LicenseState = 'ACTIVE' | 'LOCKED'

export type LicenseReason = 'NO_LOCK' | 'FINGERPRINT_MISMATCH' | 'CORRUPT'

export interface LicenseStatus {
  state: LicenseState
  reason?: LicenseReason
}
