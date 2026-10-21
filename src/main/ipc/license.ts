import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { getInstallDir, verifyInstallLock } from '../licensing/install-lock'
import { handle } from './handle'

export function registerLicenseIpc(): void {
  handle(IPC_CHANNELS.LICENSE_STATUS, () => verifyInstallLock(getInstallDir()))
}
