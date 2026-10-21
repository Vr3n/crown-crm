/**
 * Post-build script to apply Electron fuses to the built executable.
 *
 * Usage: npx tsx scripts/apply-fuses.ts [path-to-exe]
 * Default: dist/app-1.0.0-setup.exe (NSIS installer creates the unpacked dir)
 *
 * Fuses applied:
 * - EnableEmbeddedAsarIntegrityValidation: true
 * - OnlyLoadAppFromAsar: true
 *
 * Run after electron-builder, before shipping.
 */
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const distDir = join(import.meta.dirname, '..', 'dist')

// Find the unpacked app directory
function findAppExe(): string {
  const arg = process.argv[2]
  if (arg) return arg

  // electron-builder --dir creates dist/<productName>-<platform>-<arch>/
  // Look for the .exe in common locations
  const candidates = [
    join(distDir, 'app-win-unpacked', 'app.exe'),
    join(distDir, 'win-unpacked', 'app.exe')
  ]

  for (const c of candidates) {
    if (existsSync(c)) return c
  }

  console.error('Could not find app.exe in dist/. Run electron-builder --dir first.')
  console.error('Searched:', candidates)
  process.exit(1)
}

async function main(): Promise<void> {
  const exePath = findAppExe()
  console.log(`Applying fuses to: ${exePath}`)

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true
  })

  console.log('Fuses applied successfully.')
}

main().catch((err) => {
  console.error('Failed to apply fuses:', err)
  process.exit(1)
})
