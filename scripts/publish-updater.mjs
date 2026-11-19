#!/usr/bin/env node
/**
 * Publishes `dist/latest.json` to the stable `updater` release.
 *
 * GitHub's `/releases/latest/download/...` URL skips prereleases, and Crown
 * Books marks its versioned releases as prereleases. The updater therefore
 * reads the manifest from a fixed release tag that is overwritten on every
 * release. The versioned installer keeps its own release and URL.
 *
 * Usage: node scripts/publish-updater.mjs   (after semantic-release's GitHub step)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = join(root, 'dist', 'latest.json')
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN

if (!existsSync(manifest)) {
  console.error(`publish-updater: no manifest at ${manifest}`)
  process.exit(1)
}

const { repository } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const match = String(repository?.url ?? '').match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/)
if (!match) {
  console.error('publish-updater: cannot determine the GitHub repository')
  process.exit(1)
}
const repo = `${match[1]}/${match[2]}`
const env = { ...process.env, GH_TOKEN: token ?? '' }

function gh(args) {
  return execFileSync('gh', args, { cwd: root, env, encoding: 'utf8' }).trim()
}

try {
  gh(['release', 'view', 'updater', '--repo', repo])
} catch {
  console.log('publish-updater: creating the updater release')
  gh([
    'release',
    'create',
    'updater',
    '--repo',
    repo,
    '--title',
    'Crown Books updates',
    '--notes',
    'Updater manifest for Crown Books. This release is managed by the release workflow; do not delete it.',
    '--prerelease'
  ])
}

gh(['release', 'upload', 'updater', manifest, '--repo', repo, '--clobber'])
console.log(`publish-updater: ${repo} updater/latest.json`)
