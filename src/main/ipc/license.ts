import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { getInstallDir, verifyInstallLock } from '../licensing/install-lock'
import { handle } from './handle'

export function registerLicenseIpc(): void {
  handle(IPC_CHANNELS.LICENSE_STATUS, () => {
    // End-to-end tests run from the source tree, where there is no installer
    // lock. The flag is set only by the Playwright launcher.
    if (process.env.CROWN_BOOKS_E2E === '1') return { state: 'ACTIVE' as const }
    return verifyInstallLock(getInstallDir())
  })
}
