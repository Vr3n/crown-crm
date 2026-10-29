#!/usr/bin/env node
/**
 * Copies the version from `package.json` into the two Rust/desktop manifests.
 *
 * `@semantic-release/npm` bumps `package.json`; the Tauri bundle takes its
 * version from `src-tauri/tauri.conf.json` and `Cargo.toml`, so without this
 * step every release would still build `0.1.0`. `Cargo.lock` follows on the
 * next build.
 *
 * Usage: node scripts/sync-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (!/^\d+\.\d+\.\d+([-+].+)?$/.test(version)) {
  console.error(`sync-version: package.json version "${version}" is not semver`)
  process.exit(1)
}

/** Rewrites one file and reports whether the contents changed. */
function sync(relativePath, pattern, replacement) {
  const path = join(root, relativePath)
  const before = readFileSync(path, 'utf8')
  if (!pattern.test(before)) {
    console.error(`sync-version: no version field matched in ${relativePath}`)
    process.exit(1)
  }
  const after = before.replace(pattern, replacement)
  if (after !== before) writeFileSync(path, after)
  console.log(`sync-version: ${relativePath} -> ${version}${after === before ? ' (unchanged)' : ''}`)
}

// `src-tauri/Cargo.toml` has exactly one `version = "..."` at the start of a
// line: the `[package]` version. Dependency versions live inside inline tables.
sync('src-tauri/Cargo.toml', /^version = "[^"]*"$/m, `version = "${version}"`)
sync('src-tauri/tauri.conf.json', /("version":\s*")[^"]*(")/, `$1${version}$2`)
