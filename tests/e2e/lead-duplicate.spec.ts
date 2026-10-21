import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

/**
 * Duplicate-lead detection E2E (real Electron app, Playwright `_electron`).
 *
 * Regression test for docs/107: the New Lead form probes the backend while
 * typing so a person that already exists is caught BEFORE submit.
 *
 * Flow: fresh profile (temp userData) -> org setup -> create a reference lead ->
 * open the form again and assert:
 *   1. same name + same phone  -> blocking `role="alert"` error + disabled submit,
 *   2. different name, same phone -> amber `#phone-warning`, submit enabled,
 *   3. duplicate email -> amber `#email-warning`, still non-blocking,
 *   4. the real backend still refuses on submit (form-level error).
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function completeOrgSetup(page: Page): Promise<void> {
  await page.getByLabel(/organization name/i).fill('E2E Test Gym')
  await page.getByLabel(/organization mobile number/i).fill('9876501234')
  await page.getByLabel(/owner full name/i).fill('E2E Owner')
  await page.getByLabel(/owner email/i).fill('e2e-owner@example.com')
  // Password field(s): fill every password input with a strong value.
  for (const input of await page.locator('input[type="password"]').all()) {
    await input.fill('E2eStrong!1')
  }
  await page
    .getByRole('button', { name: /create|get started|continue|submit/i })
    .first()
    .click()
}

async function openNewLeadDialog(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.getByText(/^new lead$/i).click()
  const dialog = page.getByRole('dialog', { name: /new lead/i })
  await expect(dialog).toBeVisible()
  return dialog
}

async function pickSource(
  page: Page,
  dialog: ReturnType<Page['getByRole']>,
  name: string
): Promise<void> {
  // The search input only exists once the combobox popover opens, and both the
  // input and the options render in a Radix portal — scope to `page`, not the dialog.
  await dialog.getByRole('combobox', { name: /source/i }).click()
  await page.getByPlaceholder(/search or add a source/i).fill(name.slice(0, 4))
  await page.getByRole('option', { name: new RegExp(`^${name}`, 'i') }).click()
}

test('duplicate lead is blocked on name+phone and warned (amber) on phone/email reuse', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-'))
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 60_000
  })
  try {
    const page = await app.firstWindow()

    // 1. Fresh profile lands on org setup — complete it.
    await expect(page.getByLabel(/organization name/i)).toBeVisible({ timeout: 30_000 })
    await completeOrgSetup(page)
    await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
      timeout: 30_000
    })

    // 2. Create two reference leads so both pleasant Amber cases have a
    //    different person to blame: Rahul owns the phone, Rohit owns the email
    //    the duplicate form will reuse.
    let leadDialog = await openNewLeadDialog(page)
    await leadDialog.locator('#name').fill('Rahul Sharma')
    await leadDialog.locator('#phone').fill('9876543210')
    await leadDialog.locator('#email').fill('rahul@example.com')
    await pickSource(page, leadDialog, 'Walk-in')
    await leadDialog.getByRole('button', { name: /^create lead$/i }).click()
    await expect(leadDialog).toBeHidden({ timeout: 15_000 })

    leadDialog = await openNewLeadDialog(page)
    await leadDialog.locator('#name').fill('Rohit Mehra')
    await leadDialog.locator('#phone').fill('9876543211')
    await leadDialog.locator('#email').fill('rohit@example.com')
    await pickSource(page, leadDialog, 'Walk-in')
    await leadDialog.getByRole('button', { name: /^create lead$/i }).click()
    await expect(leadDialog).toBeHidden({ timeout: 15_000 })

    // 3. Reopen and type the same name + phone → blocking error, submit disabled.
    leadDialog = await openNewLeadDialog(page)
    await pickSource(page, leadDialog, 'Walk-in')
    await leadDialog.locator('#name').fill('Rahul Sharma')
    await leadDialog.locator('#phone').fill('9876543210')

    await expect(leadDialog.locator('#phone-error')).toContainText(/already exists/i, {
      timeout: 15_000
    })
    await expect(leadDialog.getByRole('button', { name: /^create lead$/i })).toBeDisabled()

    // 4. Same phone, different name → amber warning, non-blocking.
    await leadDialog.locator('#name').fill('Neha Kapoor')
    await expect(leadDialog.locator('#phone-warning')).toContainText(/on file for Rahul Sharma/i, {
      timeout: 15_000
    })
    await expect(leadDialog.locator('#phone-error')).toBeHidden()
    await expect(leadDialog.getByRole('button', { name: /^create lead$/i })).toBeEnabled()

    // 5. Duplicate email (belonging to a different person than the phone) →
    //    amber warning, still non-blocking.
    await leadDialog.locator('#email').fill('rohit@example.com')
    await expect(leadDialog.locator('#email-warning')).toContainText(
      /already belongs to Rohit Mehra/i,
      { timeout: 15_000 }
    )
    await expect(leadDialog.getByRole('button', { name: /^create lead$/i })).toBeEnabled()

    // 6. The backend still refuses on submit — the form surfaces the conflict.
    await leadDialog.getByRole('button', { name: /^create lead$/i }).click()
    await expect(
      leadDialog.getByRole('alert').filter({ hasText: /already has an active lead/i })
    ).toBeVisible({ timeout: 15_000 })
  } finally {
    await app.close()
  }
})