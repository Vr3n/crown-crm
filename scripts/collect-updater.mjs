#!/usr/bin/env node
/**
 * Writes the Tauri updater manifest for the installer Tauri just built.
 *
 * The updater reads a static JSON file. `latest.json` points at the exact
 * signed installer in this release, so the manifest and the asset have to be
 * produced together after `tauri build`. The version comes from package.json,
 * which semantic-release has already bumped and `sync-version.mjs` has copied
 * into the Tauri manifest.
 *
 * Usage: node scripts/collect-updater.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

/** `owner/repo` from the checkout's origin remote. */
function repository() {
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8'
    }).trim()
    const match = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
    if (match) return `${match[1]}/${match[2]}`
  } catch {
    // Fall through to the package.json repository URL.
  }
  const { repository: declared } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const match = String(declared?.url ?? '').match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
  if (!match) throw new Error('collect-updater: cannot determine the GitHub repository')
  return `${match[1]}/${match[2]}`
}

const installers = readdirSync(bundleDir)
  .filter((name) => name.endsWith('-setup.exe'))
  .map((name) => join(bundleDir, name))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

if (installers.length === 0) {
  console.error(`collect-updater: no NSIS installer under ${bundleDir}`)
  process.exit(1)
}

const installer = installers[0]
const signaturePath = `${installer}.sig`
let signature
try {
  signature = readFileSync(signaturePath, 'utf8').trim()
} catch {
  console.error(`collect-updater: no signature at ${signaturePath}`)
  console.error('collect-updater: set TAURI_SIGNING_PRIVATE_KEY before building')
  process.exit(1)
}

const tag = process.argv[2] ?? `v${version}`
const asset = `Crown-Books-${version}-setup.exe`
const manifest = {
  version,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repository()}/releases/download/${tag}/${asset}`
    }
  }
}

const target = join(root, 'dist', 'latest.json')
writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`collect-updater: ${target}`)
console.log(`collect-updater: ${manifest.platforms['windows-x86_64'].url}`)
