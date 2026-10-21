import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

/**
 * Dashboard "Upcoming Follow-ups" → Mark done opens the same Complete dialog
 * and carries the optional "Change Status?" move.
 *
 * Regression guard: the dashboard card's per-row "Mark done" verb must open the
 * shared Complete follow-up dialog (with the stage-change select), just like the
 * Follow-ups queue — not an inline/deprecated completion that skips the move.
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function completeOrgSetup(page: Page): Promise<void> {
  await page.getByLabel(/organization name/i).fill('E2E Test Gym')
  await page.getByLabel(/organization mobile number/i).fill('9876501234')
  await page.getByLabel(/owner full name/i).fill('E2E Owner')
  await page.getByLabel(/owner email/i).fill('e2e-owner@example.com')
  for (const input of await page.locator('input[type="password"]').all()) {
    await input.fill('E2eStrong!1')
  }
  await page
    .getByRole('button', { name: /create|get started|continue|submit/i })
    .first()
    .click()
}

async function createLead(page: Page, name: string, phone: string): Promise<void> {
  await page.getByText(/^new lead$/i).click()
  const dialog = page.getByRole('dialog', { name: /new lead/i })
  await expect(dialog).toBeVisible()

  await dialog.locator('#name').fill(name)
  await dialog.locator('#phone').fill(phone)
  await dialog.locator('#email').fill('')
  await dialog.getByRole('combobox', { name: /source/i }).click()
  await page.getByPlaceholder(/search or add a source/i).fill('Walk')
  await page.getByRole('option', { name: /^Walk-in/i }).click()
  await dialog.getByRole('button', { name: /^create lead$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

test('dashboard mark done opens the dialog with Change Status? and completes the follow-up', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-dash-'))
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 60_000
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByLabel(/organization name/i)).toBeVisible({ timeout: 30_000 })
    await completeOrgSetup(page)
    await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
      timeout: 30_000
    })

    await createLead(page, 'Dash Probe Lead', '9876543213')

    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: /done$/i }) })
      .filter({ hasText: 'Dash Probe Lead' })
    await expect(row).toBeVisible({ timeout: 15_000 })

    await row.getByRole('button', { name: /done$/i }).click()
    const dialog = page.getByRole('dialog', { name: /mark follow-up done/i })
    await expect(dialog).toBeVisible()

    // The change-status select is present on the dashboard path too.
    await expect(dialog.getByRole('combobox', { name: /Change Status\?/ })).toBeVisible()

    await dialog.getByRole('combobox', { name: /Change Status\?/ }).click()
    await page.getByRole('option', { name: /^Contacted/ }).click()
    await dialog.getByRole('button', { name: /^Mark done$/i }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Completed: the verb disappears and the follow-up leaves the Upcoming card.
    await expect(page.getByRole('button', { name: 'Mark Post enquiry followup done' })).toHaveCount(
      0
    )
  } finally {
    await app.close()
  }
})
