import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'

/**
 * Organization logo E2E (real Electron app, #113).
 *
 * Rendered flows only: upload shows the logo in the sidebar brand row and the
 * profile card; invalid files surface an error; remove restores the fallback.
 * Unit suites own: contract shapes, size/ext validation tables, backend
 * replace-deletes-old, missing-file PDF degrade.
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

/** 1x1 transparent PNG fixture. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function launchFreshApp(
  logoPath?: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-logo-'))
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 60_000
  })
  const page = await app.firstWindow()
  await expect(page.getByLabel(/organization name/i)).toBeVisible({ timeout: 30_000 })
  await page.getByLabel(/organization name/i).fill('E2E Logo Gym')
  if (logoPath) {
    await page.getByLabel(/gym logo/i).setInputFiles(logoPath)
    await expect(page.getByRole('img', { name: /logo preview/i })).toBeVisible({
      timeout: 10_000
    })
  }
  await page.getByLabel(/organization mobile number/i).fill('9876501234')
  await page.getByLabel(/owner full name/i).fill('E2E Owner')
  await page.getByLabel(/owner email/i).fill('e2e-logo@example.com')
  for (const input of await page.locator('input[type="password"]').all()) {
    await input.fill('E2eStrong!1')
  }
  await page
    .getByRole('button', { name: /create|get started|continue|submit/i })
    .first()
    .click()
  await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
    timeout: 30_000
  })
  return { app, page }
}

async function openOrgSettings(page: Page): Promise<void> {
  await page
    .locator('nav')
    .getByRole('link', { name: /^organization$/i })
    .click()
  await expect(
    page.getByRole('main').getByRole('heading', { name: /^organization$/i })
  ).toBeVisible({
    timeout: 15_000
  })
}

test('upload logo shows in sidebar and profile card, remove restores fallback', async () => {
  const { app, page } = await launchFreshApp()
  try {
    await openOrgSettings(page)
    await page.getByRole('button', { name: /^edit$/i }).click()
    const dialog = page.getByRole('dialog', { name: /edit organization/i })
    await expect(dialog).toBeVisible()

    const pngPath = join(mkdtempSync(join(tmpdir(), 'crowncrm-logo-')), 'gym.png')
    writeFileSync(pngPath, TINY_PNG)
    await dialog.locator('input[type="file"]').setInputFiles(pngPath)
    await expect(page.getByText(/logo updated/i)).toBeVisible({ timeout: 15_000 })

    // Sidebar brand row shows the uploaded logo beside the gym name.
    // NB: CSS locator, not getByRole('img') — Chromium's a11y tree in
    // Electron doesn't expose data-URI <img> nodes to role queries.
    const brand = page.locator('aside').first()
    await expect(brand.locator('img[alt="E2E Logo Gym logo"]')).toBeVisible({
      timeout: 15_000
    })

    // Profile card header shows the same logo.
    await expect(page.locator('img[alt="E2E Logo Gym logo"]').first()).toBeVisible()

    // Remove restores the icon fallback (upload applies immediately, so
    // close the still-open dialog first).
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 10_000 })
    await page.getByRole('button', { name: /^edit$/i }).click()
    const dialog2 = page.getByRole('dialog', { name: /edit organization/i })
    await expect(dialog2).toBeVisible()
    await dialog2.getByRole('button', { name: /^remove$/i }).click()
    await expect(page.getByText(/logo removed/i)).toBeVisible({ timeout: 15_000 })
    await expect(brand.locator('img[alt="E2E Logo Gym logo"]')).toBeHidden()
  } finally {
    await app.close()
  }
})

test('setup with logo shows it in the sidebar immediately', async () => {
  const pngPath = join(mkdtempSync(join(tmpdir(), 'crowncrm-logo-')), 'gym.png')
  writeFileSync(pngPath, TINY_PNG)
  const { app, page } = await launchFreshApp(pngPath)
  try {
    // Landed on the dashboard: the sidebar brand already carries the logo.
    const brand = page.locator('aside').first()
    await expect(brand.locator('img[alt="E2E Logo Gym logo"]')).toBeVisible({
      timeout: 15_000
    })
  } finally {
    await app.close()
  }
})

test('invalid logo file surfaces an error and keeps the fallback', async () => {
  const { app, page } = await launchFreshApp()
  try {
    await openOrgSettings(page)
    await page.getByRole('button', { name: /^edit$/i }).click()
    const dialog = page.getByRole('dialog', { name: /edit organization/i })
    await expect(dialog).toBeVisible()

    const txtPath = join(mkdtempSync(join(tmpdir(), 'crowncrm-logo-')), 'gym.txt')
    writeFileSync(txtPath, 'not an image')
    await dialog.locator('input[type="file"]').setInputFiles(txtPath)
    await expect(dialog.getByRole('alert')).toContainText(/jpg/i, { timeout: 10_000 })
  } finally {
    await app.close()
  }
})
