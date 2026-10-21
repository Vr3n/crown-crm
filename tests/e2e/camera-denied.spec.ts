import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

/**
 * Camera-denial E2E (real Electron app, Playwright `_electron`).
 *
 * Regression test for the freeze where a denied/blocked camera called the
 * synchronous `window.alert()` inside the capture dialog, blocking the
 * renderer and freezing the whole app (including the parent New Lead form).
 *
 * Flow: fresh profile (temp userData) -> org setup -> Leads -> New lead ->
 * Capture toggle -> "Capture photo" with `getUserMedia` stubbed to reject
 * with NotAllowedError. Then asserts:
 *   1. an inline `role="alert"` error is rendered inside the capture dialog,
 *   2. `window.alert` was never invoked (spy installed via addInitScript),
 *   3. the app stays responsive (Retry re-attempts, Close dismisses only the
 *      capture dialog, the New Lead form is still open and usable).
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function stubCameraAndAlert(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Spy: record any blocking alert() call instead of showing it.
    ;(window as unknown as { __alertCalls: number }).__alertCalls = 0
    window.alert = () => {
      ;(window as unknown as { __alertCalls: number }).__alertCalls += 1
    }
    // Deny camera access like a user rejecting the permission prompt.
    const denial = (): Promise<MediaStream> =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = denial
    } else {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: denial },
        configurable: true
      })
    }
  })
}

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

test('denied camera shows inline error and never freezes the app', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-'))
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 60_000
  })
  try {
    const page = await app.firstWindow()
    await stubCameraAndAlert(page)
    // addInitScript only applies to subsequently loaded documents; the app
    // window is already open, so reload to install the stubs before setup.
    await page.reload()

    // 1. Fresh profile lands on org setup — complete it.
    await expect(page.getByLabel(/organization name/i)).toBeVisible({ timeout: 30_000 })
    await completeOrgSetup(page)

    // 2. Open the New Lead form via the dashboard quick action.
    await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
      timeout: 30_000
    })
    await page.getByText(/^new lead$/i).click()
    const leadDialog = page.getByRole('dialog', { name: /new lead/i })
    await expect(leadDialog).toBeVisible()

    // 3. Switch avatar to Capture mode and open the camera dialog.
    await leadDialog.getByRole('button', { name: /^capture$/i }).click()
    await leadDialog.getByRole('button', { name: /^capture photo$/i }).click()
    const cameraDialog = page.getByRole('dialog', { name: /capture photo/i })
    await expect(cameraDialog).toBeVisible()

    // 4. Inline, non-blocking error (permission denied).
    const inlineError = cameraDialog.getByRole('alert')
    await expect(inlineError).toContainText(/permission|denied/i, { timeout: 15_000 })

    // 5. No blocking alert() was ever invoked.
    const alertCalls = await page.evaluate(
      () => (window as unknown as { __alertCalls: number }).__alertCalls ?? 0
    )
    expect(alertCalls).toBe(0)

    // 6. App stays responsive: Retry re-attempts and the error persists…
    await cameraDialog.getByRole('button', { name: /^retry$/i }).click()
    await expect(cameraDialog.getByRole('alert')).toContainText(/permission|denied/i, {
      timeout: 15_000
    })

    // 7. …Close dismisses only the capture dialog; the New Lead form survives.
    const footer = cameraDialog.locator('[data-slot="dialog-footer"]')
    await footer.getByRole('button', { name: /^close$/i }).click()
    await expect(cameraDialog).toBeHidden({ timeout: 10_000 })
    await expect(leadDialog).toBeVisible()
    // Parent form still interactive.
    await expect(leadDialog.getByRole('button', { name: /^capture photo$/i })).toBeVisible()

    // 8. Still no alert() after the whole flow.
    const alertCallsAfter = await page.evaluate(
      () => (window as unknown as { __alertCalls: number }).__alertCalls ?? 0
    )
    expect(alertCallsAfter).toBe(0)
  } finally {
    await app.close()
  }
})
