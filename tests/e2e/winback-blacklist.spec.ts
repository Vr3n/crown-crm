import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'

/**
 * Win-back + terminal-confirm + blacklist, rendered in the real app:
 *
 * 1. win-back — a LOST lead keeps its pending follow-up on the dashboard card
 *    with a visible Lost badge; its Mark-done dialog offers Change Status?,
 *    and completing with a move re-opens the lead (badges flip to Contacted).
 * 2. terminal confirm + blacklist — scheduling for a LOST lead asks for
 *    confirmation; blacklisting then cancels pending follow-ups, keeps the
 *    lead visible (views kept), excludes it from pickers, and refuses new
 *    work with a refunds-only error.
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function launch(): Promise<{
  app: Awaited<ReturnType<typeof electron.launch>>
  page: Page
}> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-winback-'))
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    timeout: 60_000
  })
  const page = await app.firstWindow()
  await expect(page.getByLabel(/organization name/i)).toBeVisible({ timeout: 30_000 })
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
  await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
    timeout: 30_000
  })
  return { app, page }
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

/** Opens the lead's detail page from the Pipeline table. */
async function openLeadDetail(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Pipeline', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: name }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.getByText(name).first().click()
  await expect(page).toHaveURL(/\/leads\/\d+/, { timeout: 15_000 })
}

async function goDashboard(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await expect(page.getByText(/good evening|good morning|good afternoon/i)).toBeVisible({
    timeout: 15_000
  })
}

async function markLeadLost(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Mark as lost' }).click()
  const dialog = page.getByRole('dialog', { name: new RegExp(`Mark ${name} as lost`, 'i') })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox').click()
  await page.getByRole('option').first().click()
  await dialog.getByRole('button', { name: 'Mark as lost' }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

function dashboardLeadRow(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: /done$/i }) })
    .filter({ hasText: name })
}

test('lost lead shows stage context and Change Status re-opens it', async () => {
  const { app, page } = await launch()
  try {
    await createLead(page, 'Winback Wally', '9876543214')
    await openLeadDetail(page, 'Winback Wally')
    await markLeadLost(page, 'Winback Wally')

    await goDashboard(page)
    const row = dashboardLeadRow(page, 'Winback Wally')
    await expect(row).toBeVisible({ timeout: 15_000 })

    // Stage context is visible right under the name.
    await expect(row.getByText('Lost')).toBeVisible()

    await row.getByRole('button', { name: /done$/i }).click()
    const dialog = page.getByRole('dialog', { name: /mark follow-up done/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: /Change Status\?/ })).toBeVisible()

    await dialog.getByRole('combobox', { name: /Change Status\?/ }).click()
    await page.getByRole('option', { name: /^Contacted/ }).click()
    await dialog.getByRole('button', { name: /^Mark done$/i }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Completed with a move: the follow-up leaves the Upcoming card…
    await expect(page.getByRole('button', { name: 'Mark Post enquiry followup done' })).toHaveCount(
      0
    )

    // …and the lead reads Contacted back on the Pipeline board.
    await page.getByRole('link', { name: 'Pipeline', exact: true }).click()
    const boardRow = page.getByRole('row').filter({ hasText: 'Winback Wally' }).first()
    await expect(boardRow).toBeVisible({ timeout: 15_000 })
    await expect(boardRow.getByText('Contacted')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('terminal scheduling confirms, blacklist blocks actions but keeps views', async () => {
  const { app, page } = await launch()
  try {
    await createLead(page, 'Terminal Tina', '9876543215')
    await openLeadDetail(page, 'Terminal Tina')
    await markLeadLost(page, 'Terminal Tina')
    await goDashboard(page)

    // Scheduling for the LOST lead asks for confirmation first.
    await page.getByRole('button', { name: 'Schedule Follow-Up' }).click()
    const scheduleDialog = page.getByRole('dialog', { name: /schedule a follow-up/i })
    await expect(scheduleDialog).toBeVisible()
    // Exactly one combobox here (the lead picker — no target yet, so no
    // Change Status? select); its accessible name comes from content.
    await scheduleDialog.getByRole('combobox').click()
    await page.getByPlaceholder(/search by name or phone/i).fill('Tina')
    await page.getByRole('option', { name: /Terminal Tina/ }).click()
    await scheduleDialog.getByLabel(/What to do/).fill('Win-back attempt')
    await scheduleDialog.getByRole('button', { name: /due/i }).click()
    const calendar = page.locator('[data-slot="popover-content"]')
    await calendar.getByRole('button', { name: 'Go to the Next Month' }).click()
    await calendar.locator('button:text-is("15")').click()
    await scheduleDialog.getByRole('button', { name: /^Schedule$/i }).click()

    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog.getByText(/Schedule for a Lost lead/)).toBeVisible({
      timeout: 15_000
    })
    await confirmDialog.getByRole('button', { name: 'Schedule anyway' }).click()
    await expect(scheduleDialog).toBeHidden({ timeout: 15_000 })

    // Blacklist the person from the detail page.
    await openLeadDetail(page, 'Terminal Tina')
    await page.getByRole('button', { name: 'Blacklist person' }).first().click()
    const blacklistDialog = page.getByRole('dialog', { name: /blacklist terminal tina/i })
    await expect(blacklistDialog).toBeVisible()
    await blacklistDialog.getByRole('button', { name: 'Blacklist person' }).click()
    await expect(blacklistDialog).toBeHidden({ timeout: 15_000 })

    await goDashboard(page)

    // Pending follow-ups were cancelled on blacklist: no actionable rows…
    await expect(dashboardLeadRow(page, 'Terminal Tina')).toHaveCount(0)

    // …but views are kept: the lead still shows in the dashboard tables…
    await expect(page.getByRole('row').filter({ hasText: 'Terminal Tina' }).first()).toBeVisible({
      timeout: 15_000
    })

    // …the picker excludes her…
    await page.getByRole('button', { name: 'Schedule Follow-Up' }).click()
    const pickerDialog = page.getByRole('dialog', { name: /schedule a follow-up/i })
    await expect(pickerDialog).toBeVisible()
    await pickerDialog.getByRole('combobox').click()
    await page.getByPlaceholder(/search by name or phone/i).fill('Tina')
    await expect(page.getByText('No leads found.')).toBeVisible()
    await pickerDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(pickerDialog).toBeHidden({ timeout: 15_000 })

    // …and new work is refused with a refunds-only error.
    await openLeadDetail(page, 'Terminal Tina')
    await page.getByRole('button', { name: 'Log activity' }).click()
    const activityDialog = page.getByRole('dialog', { name: /log an activity/i })
    await expect(activityDialog).toBeVisible()
    await activityDialog.getByLabel('Note').fill('Tried to call')
    await activityDialog.getByRole('button', { name: /^Log activity$/i }).click()
    // Terminal confirm first (LOST lead), then the backend refuses the write.
    const logConfirm = page.getByRole('alertdialog')
    await expect(logConfirm.getByText(/Log for a Lost lead/)).toBeVisible({ timeout: 15_000 })
    await logConfirm.getByRole('button', { name: 'Log anyway' }).click()
    await expect(
      page.getByRole('region', { name: /notifications/i }).getByText(/refunds only/i)
    ).toBeVisible({ timeout: 15_000 })
  } finally {
    await app.close()
  }
})
