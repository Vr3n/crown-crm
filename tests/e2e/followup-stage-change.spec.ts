import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

/**
 * Follow-up "mark done" with an optional stage change (rendered, not unit).
 *
 * Two real-app flows on the Follow-ups page:
 *   1. row-level — the per-row Mark done verb opens the Complete flow which
 *      carries an optional Change Status? move, and the lead's stage flips.
 *   2. bulk — the "Mark all as done" toolbar verb completes every selected
 *      follow-up in one call and moves all their leads together.
 * The stage provably moved by reopening each lead from its queue row and
 * reading the stage badge.
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

/** Creates a lead and expands the follow-up collapsible so one is scheduled. */
async function createLeadWithFollowUp(
  page: Page,
  name: string,
  phone: string,
  email: string
): Promise<void> {
  await page.getByText(/^new lead$/i).click()
  const dialog = page.getByRole('dialog', { name: /new lead/i })
  await expect(dialog).toBeVisible()

  await dialog.locator('#name').fill(name)
  await dialog.locator('#phone').fill(phone)
  await dialog.locator('#email').fill(email)
  await dialog.getByRole('button', { name: /schedule a follow-up/i }).click()
  await dialog.getByRole('combobox', { name: /source/i }).click()
  await page.getByPlaceholder(/search or add a source/i).fill('Walk')
  await page.getByRole('option', { name: /^Walk-in/i }).click()
  await dialog.getByRole('button', { name: /^create lead$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

async function openFollowUps(page: Page): Promise<void> {
  await page.getByRole('link', { name: /follow-ups/i }).first().click()
  await expect(page.getByRole('main').getByRole('heading', { name: 'Follow-ups' })).toBeVisible()
}

/** Completes the row-level dialog for the given follow-up with a stage change. */
async function completeWithStageChange(
  page: Page,
  row: ReturnType<Page['getByRole']>
): Promise<void> {
  await row.getByRole('button', { name: 'Mark follow-up done' }).click()
  const dialog = page.getByRole('dialog', { name: /mark follow-up done/i })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('combobox', { name: /Change Status\?/ }).click()
  await page.getByRole('option', { name: /^Contacted/ }).click()
  await dialog.getByRole('button', { name: 'Mark done' }).click()

  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

test('row-level mark done moves the lead stage via the queue action', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-'))
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

    await createLeadWithFollowUp(page, 'Rahul Sharma', '9876543201', 'rahul@example.com')
    await openFollowUps(page)

    const row = page.getByRole('row').filter({ hasText: 'Post enquiry followup' }).first()
    await expect(row).toBeVisible()
    await completeWithStageChange(page, row)

    // Completed in the queue: the verb disappears, the badge flips to Done.
    await expect(row.getByRole('button', { name: 'Mark follow-up done' })).toHaveCount(0)
    await expect(row.getByText('Done', { exact: true })).toBeVisible({ timeout: 15_000 })

    // Open the lead from the queue and read the moved stage badge.
    await row.click()
    await expect(page.getByText('Rahul Sharma', { exact: true }).first()).toBeVisible({
      timeout: 15_000
    })
    await expect(page.getByText('Contacted', { exact: true }).first()).toBeVisible()
  } finally {
    await app.close()
  }
})

test('bulk mark all as done moves every selected lead to the same stage', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-'))
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

    await createLeadWithFollowUp(page, 'Rahul Sharma', '9876543202', 'rahul@example.com')
    await createLeadWithFollowUp(page, 'Neha Kapoor', '9876543203', 'neha@example.com')
    await openFollowUps(page)

    const rows = page.getByRole('row').filter({ hasText: 'Post enquiry followup' })
    await expect(rows).toHaveCount(2)

    await page.getByRole('checkbox', { name: 'Select all rows on this page' }).check()
    await page.getByRole('button', { name: 'Mark all as done' }).click()

    const dialog = page.getByRole('dialog', { name: /mark follow-ups as done/i })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('combobox', { name: /Change Status\?/ }).click()
    await page.getByRole('option', { name: /^Contacted/ }).click()
    await dialog.getByRole('button', { name: 'Mark done' }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await expect(page.getByRole('button', { name: 'Mark follow-up done' })).toHaveCount(0)
    await expect(page.getByText('Done', { exact: true }).first()).toBeVisible({ timeout: 15_000 })

    // Both leads individually show the moved stage.
    for (const leadName of ['Rahul Sharma', 'Neha Kapoor']) {
      const row = page.getByRole('row').filter({ hasText: leadName }).first()
      await row.click()
      await expect(page.getByText(leadName, { exact: true }).first()).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByText('Contacted', { exact: true }).first()).toBeVisible()
      await openFollowUps(page)
    }
  } finally {
    await app.close()
  }
})
