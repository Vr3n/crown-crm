/**
 * Smoke test for the packaged Windows build.
 *
 * `npm run build:win` can succeed while the shipped app is broken: pruning a
 * `node_modules` subdirectory that drizzle loads lazily (for example
 * `drizzle-orm/up-migrations`) only fails at runtime, inside the asar, behind a
 * Windows error dialog. This script launches the packaged executable against a
 * throwaway data directory and asserts that the window opens and the IPC bridge
 * answers a real SQLite query.
 *
 * Usage: npm run build:win && npm run smoke:win
 */
import { _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const exe = resolve('dist', 'win-unpacked', 'CrownCRM.exe')

if (!existsSync(exe)) {
  console.error(`Packaged app not found at ${exe}. Run \`npm run build:win\` first.`)
  process.exit(1)
}

const userData = mkdtempSync(join(tmpdir(), 'crown-packaged-smoke-'))
let app

try {
  app = await electron.launch({
    executablePath: exe,
    env: {
      ...process.env,
      CROWN_BOOKS_E2E: '1',
      CROWN_BOOKS_USER_DATA: userData
    },
    timeout: 60_000
  })

  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean(window.api), null, { timeout: 60_000 })

  // First run: creates the company and the owner, which writes through the
  // migration-run database. Then read back through a second IPC call.
  const session = await page.evaluate(() =>
    window.api.identity.setup({
      name: 'Packaged Smoke Co',
      ownerFullName: 'Smoke Tester',
      ownerEmail: 'smoke@example.com',
      ownerPassword: 'correct-horse'
    })
  )
  if (!session?.userId) throw new Error('identity.setup did not return a session')

  const numbering = await page.evaluate(() => window.api.numbering.list())
  if (!Array.isArray(numbering) || numbering.length === 0) {
    throw new Error('numbering.list did not return the seeded rows')
  }

  const parties = await page.evaluate(() => window.api.parties.list({}))
  if (!Array.isArray(parties)) throw new Error('parties.list did not return an array')

  const title = await page.title()
  console.log(
    `packaged smoke ok: "${title}", ${numbering.length} numbering rows, ${parties.length} parties`
  )
} catch (error) {
  console.error('packaged smoke failed:', error)
  process.exitCode = 1
} finally {
  await app?.close().catch(() => {})
  rmSync(userData, { recursive: true, force: true })
}
