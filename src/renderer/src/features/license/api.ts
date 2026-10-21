import type { LicenseStatus } from './types'

/** Window.api.license.* calls — typed facade over the preload bridge. */
export const api = {
  status: (): Promise<LicenseStatus> => window.api.license.status()
}
