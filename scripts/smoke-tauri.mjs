#!/usr/bin/env node
/**
 * Packaged-app smoke test.
 *
 * Launches the built Crown Books binary against a throwaway data directory,
 * waits for the database to be created and migrated, checks the schema, then
 * stops it. No window interaction is needed: the Rust startup path is
 * paths → open → migrate → seed → restore session → window.
 *
 * Usage:
 *   node scripts/smoke-tauri.mjs                       # release build
 *   node scripts/smoke-tauri.mjs "C:\Program Files\Crown Books\crown-books.exe"
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const exe = resolve(
  process.argv[2] ?? join('src-tauri', 'target', 'release', process.platform === 'win32' ? 'crown-books.exe' : 'crown-books')
)

if (!existsSync(exe)) {
  console.error(`smoke: no binary at ${exe}`)
  process.exit(1)
}

const dataDir = mkdtempSync(join(tmpdir(), 'crown-books-smoke-'))
const database = join(dataDir, 'crown-books.db')

const child = spawn(exe, [], {
  env: { ...process.env, CROWN_BOOKS_USER_DATA: dataDir, CROWN_BOOKS_E2E: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})
child.stdout.on('data', () => {})

const deadline = Date.now() + 30_000

/** @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

/** @returns {never} */
function fail(message) {
  console.error(`smoke: ${message}`)
  if (stderr.trim()) console.error(stderr.trim())
  stop()
  rmSync(dataDir, { recursive: true, force: true })
  process.exit(1)
}

/** @returns {void} */
function stop() {
  if (!child.killed) child.kill()
}

/** @returns {Promise<void>} */
async function waitForDatabase() {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) fail(`app exited early with code ${child.exitCode}`)
    if (existsSync(database)) return
    await sleep(200)
  }
  fail('the database was not created within 30s')
}

try {
  await waitForDatabase()

  // WAL means the file exists before the migration commits; retry the read.
  let tables = []
  while (Date.now() < deadline) {
    try {
      const db = new DatabaseSync(database, { readOnly: true })
      tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name)
      const migrations = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n
      const permissions = db.prepare('SELECT COUNT(*) AS n FROM permissions').get().n
      db.close()

      const required = ['companies', 'users', 'company_users', 'roles', 'permissions', 'accounts', 'items', 'vouchers']
      const missing = required.filter((name) => !tables.includes(name))
      if (missing.length > 0) fail(`missing tables: ${missing.join(', ')}`)
      if (migrations !== 4) fail(`expected 4 migrations, found ${migrations}`)
      if (permissions !== 31) fail(`expected 31 permissions, found ${permissions}`)

      // The window is alive if the process is still running after startup.
      if (child.exitCode !== null) fail(`app exited after startup with code ${child.exitCode}`)

      console.log(`smoke: ok — ${tables.length} tables, ${migrations} migrations, ${permissions} permissions`)
      console.log(`smoke: database ${database}`)
      break
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await sleep(300)
    }
  }
} finally {
  stop()
  await sleep(500)
  rmSync(dataDir, { recursive: true, force: true })
}
