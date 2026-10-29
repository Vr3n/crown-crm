#!/usr/bin/env node
/**
 * Copies the NSIS installer Tauri just built to a stable release asset name.
 *
 * Tauri names the bundle after `productName` and the crate version, which is
 * awkward to reference from a release pipeline. This finds the newest
 * `*-setup.exe` under `src-tauri/target/release/bundle/nsis` and copies it to
 * `dist/Crown-Books-<version>-setup.exe`.
 *
 * Usage: node scripts/collect-installer.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

let installers = []
try {
  installers = readdirSync(bundleDir)
    .filter((name) => name.endsWith('-setup.exe'))
    .map((name) => join(bundleDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
} catch {
  installers = []
}

if (installers.length === 0) {
  console.error(`collect-installer: no NSIS installer under ${bundleDir}`)
  process.exit(1)
}

const source = installers[0]
const targetDir = join(root, 'dist')
mkdirSync(targetDir, { recursive: true })
const target = join(targetDir, `Crown-Books-${version}-setup.exe`)
copyFileSync(source, target)

console.log(`collect-installer: ${source}`)
console.log(`collect-installer: ${target}`)
