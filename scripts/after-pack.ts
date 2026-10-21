/**
 * electron-builder afterPack hook — applies Electron fuses to the built
 * executable before the installer is created.
 *
 * Referenced in electron-builder.yml via `afterPack: scripts/after-pack.ts`
 */
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import type { AfterPackContext } from 'electron-builder'
import { join } from 'node:path'

export default async function afterPack(context: AfterPackContext): Promise<void> {
  const appOutDir = context.appOutDir
  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = join(appOutDir, exeName)

  console.log(`Applying fuses to: ${exePath}`)

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })

  console.log('Fuses applied successfully.')
}
