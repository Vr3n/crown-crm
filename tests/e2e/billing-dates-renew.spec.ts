import { existsSync, unlinkSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { addDays, format, subDays } from 'date-fns'
import ExcelJS from 'exceljs'

/**
 * Billing dates + renew shortcut E2E (real Electron app, #110).
 *
 * Three isolated launches (fresh temp profile each), all against the
 * Organization timezone default (Asia/Kolkata):
 *
 * 1. back-dated membership sale — billing date drives Invoice Number +
 *    finalized_at + payment_date; detail page + linked payment default agree.
 * 2. standalone invoice finalize with a future date + Excel wall-date parse.
 * 3. renew shortcut from the expirations table row and the record drawer.
 *
 * Unit suites own: invalid shapes, collision rollback, sequence/DB behavior,
 * DST zones, IPC enums, preload parity. This spec owns the rendered flows.
 */

const MAIN_ENTRY = join(__dirname, '..', '..', 'out', 'main', 'index.js')

function toISO(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

/** PREFIX-DDMMYY-NN dateKey embedded in the invoice number. */
function dateKeyOf(iso: string): string {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`
}

async function launchFreshApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'crowncrm-e2e-billing-'))
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
  await dialog.locator('#email').fill(`${phone}@example.com`)
  await dialog.getByRole('combobox', { name: /source/i }).click()
  await page.getByPlaceholder(/search or add a source/i).fill('Walk')
  await page.getByRole('option', { name: /^Walk-in/i }).click()
  await dialog.getByRole('button', { name: /^create lead$/i }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

/**
 * Drives a CatalogDatePicker (react-day-picker v10 in a Radix popover):
 * opens via trigger name, month-navigates to the target, clicks the day
 * (aria-label "Monday, August 11th, 2026"), then asserts the trigger text.
 */
async function pickCalendarDate(page: Page, testId: string, iso: string): Promise<void> {
  const target = new Date(`${iso}T00:00:00`)
  await page.getByTestId(testId).click()
  const wantedCaption = format(target, 'MMMM yyyy')
  const caption = page.getByText(/^[A-Z][a-z]+ 20\d{2}$/, { exact: true })
  await expect(caption.first()).toBeVisible({ timeout: 10_000 })
  for (let i = 0; i < 14; i++) {
    const current = await caption.first().textContent()
    if (current?.trim() === wantedCaption) break
    const [monthName, yearStr] = (current ?? '').trim().split(' ')
    const currentDate = new Date(`${monthName} 1, ${yearStr}`)
    if (Number.isNaN(currentDate.getTime())) throw new Error(`Unreadable caption: ${current}`)
    await page
      .getByRole('button', {
        name: currentDate.getTime() < target.getTime() ? /next month/i : /previous month/i
      })
      .click()
  }
  await expect(caption.first()).toHaveText(wantedCaption, { timeout: 10_000 })
  await page
    .getByRole('button', { name: new RegExp(`${format(target, 'MMMM do, yyyy')}`) })
    .click()
  await expect(page.getByTestId(testId)).toContainText(format(target, 'EEE, d MMM yyyy'))
}

async function pickComboboxOption(
  page: Page,
  triggerText: string,
  searchPlaceholder: RegExp,
  search: string,
  optionName: RegExp
): Promise<void> {
  // NB: triggers carry role="combobox" overrides that getByRole doesn't
  // resolve here — click the visible placeholder/selected text instead.
  await page.getByText(triggerText, { exact: true }).click()
  await page.getByPlaceholder(searchPlaceholder).fill(search)
  const option = page.getByRole('option', { name: optionName })
  // Forced: Radix+cmdk popovers can jitter (scroll-into-view, reposition)
  // without ever settling; the option node itself is stable enough to act on.
  await option.click({ force: true })
  // Popovers are non-modal: dismiss explicitly so the next trigger click
  // can't land while two floating layers compete.
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder(searchPlaceholder)).toBeHidden({ timeout: 5_000 })
}

async function toastPath(page: Page, title: RegExp): Promise<string> {
  const toast = page.locator('li[data-sonner-toast]').filter({ hasText: title }).first()
  await expect(toast).toBeVisible({ timeout: 30_000 })
  const description = await toast.locator('[data-description]').textContent()
  const match = description?.match(/[A-Z]:\\[^\s"]+\.xlsx/i)
  if (!match) throw new Error(`No .xlsx path in toast: ${description}`)
  return match[0]
}

test('back-dated membership sale drives invoice number, detail and payment default', async () => {
  // 45 days exercises month navigation and the Rule-47 caution (>30 days).
  const backdate = toISO(subDays(new Date(), 45))
  const key = dateKeyOf(backdate)
  const { app, page } = await launchFreshApp()
  try {
    await createLead(page, 'Asha Sharma', '9876543210')

    await page.getByRole('button', { name: /new membership sale/i }).click()
    await expect(page.getByRole('heading', { name: 'Membership Sale' })).toBeVisible()

    await pickComboboxOption(
      page,
      'Search a lead…',
      /search by name or phone/i,
      'Asha',
      /Asha Sharma/
    )
    await expect(page.getByText('Stage:')).toBeVisible()
    await pickComboboxOption(
      page,
      'Search a plan…',
      /search by plan name/i,
      'Monthly',
      /Monthly/
    )

    // Billing date only — membership window keeps its defaults.
    await pickCalendarDate(page, 'billing-date-picker', backdate)
    await expect(page.getByText(/invoice number uses this date/i)).toBeVisible()
    await expect(page.getByText(/rule 47/i)).toBeVisible()

    await page.locator('#summary-paid').fill('100')
    await page.getByText('Choose method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await page.getByRole('button', { name: /sell & invoice/i }).click()

    await page.waitForURL(/\/invoices\/\d+/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: new RegExp(key) })).toContainText(key)

    // Detail page derives Issued from finalized_at, not the audit timestamp.
    const expectedIssued = new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(`${backdate}T00:00:00Z`))
    await expect(page.getByText(expectedIssued, { exact: false }).first()).toBeVisible()

    // Linked payment entry defaults to the issue date.
    await page.getByRole('button', { name: /record payment/i }).click()
    const dialog = page.getByRole('dialog', { name: /record a payment/i })
    await expect(dialog).toBeVisible()
    const expectedTrigger = format(new Date(`${backdate}T00:00:00`), 'EEE, d MMM yyyy')
    await expect(dialog.getByTestId('payment-date-picker')).toContainText(expectedTrigger)
    await page.keyboard.press('Escape')
  } finally {
    await app.close()
  }
})

test('standalone finalize with future date shows in preview, number and Excel export', async () => {
  const future = toISO(addDays(new Date(), 40))
  const key = dateKeyOf(future)
  const { app, page } = await launchFreshApp()
  let exported: string | null = null
  try {
    await createLead(page, 'Rohit Mehra', '9876543211')

    // Minimal sale to mint the customer (default dates, tiny payment).
    await page.getByRole('button', { name: /new membership sale/i }).click()
    await expect(page.getByRole('heading', { name: 'Membership Sale' })).toBeVisible()
    await pickComboboxOption(page, 'Search a lead…', /search by name or phone/i, 'Rohit', /Rohit Mehra/)
    await pickComboboxOption(page, 'Search a plan…', /search by plan name/i, 'Monthly', /Monthly/)
    await page.locator('#summary-paid').fill('100')
    await page.getByText('Choose method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await page.getByRole('button', { name: /sell & invoice/i }).click()
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 30_000 })

    // Standalone invoice lives under Billing → Invoices in the sidebar.
    await page.locator('nav').getByRole('link', { name: /^invoices$/i }).click()
    await expect(page.getByRole('button', { name: /^new invoice$/i })).toBeVisible({
      timeout: 15_000
    })
    await page.getByRole('button', { name: /^new invoice$/i }).click()
    const dialog = page.getByRole('dialog', { name: /new invoice/i })
    await expect(dialog).toBeVisible()
    await pickComboboxOption(page, 'Search a customer…', /search by name or phone/i, 'Rohit', /Rohit Mehra/)
    await dialog.getByRole('button', { name: /start draft/i }).click()

    // Pick the Monthly plan to fill description/price/tax, then add the line.
    const draft = page.getByRole('dialog', { name: /draft invoice/i })
    await expect(draft).toBeVisible({ timeout: 15_000 })
    await draft.getByText('Search plans…', { exact: true }).click()
    await page.getByPlaceholder(/search plans/i).fill('Monthly')
    await page.getByRole('option', { name: /Monthly/ }).first().click()
    await draft.getByRole('button', { name: /add line/i }).click()
    await draft.getByRole('button', { name: /finalize/i }).click()

    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    await pickCalendarDate(page, 'finalize-issue-date-picker', future)
    await expect(confirm.getByText(key)).toBeVisible({ timeout: 15_000 })
    await confirm.getByRole('button', { name: /assign number/i }).click()
    await expect(confirm).toBeHidden({ timeout: 15_000 })
    await expect(
      page.getByRole('heading', { name: new RegExp(`Invoice.*${key}`) })
    ).toBeVisible({ timeout: 15_000 })

    // Export the register and verify wall-clock date cells in the workbook.
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^export$/i }).click()
    exported = await toastPath(page, /exported/i)
    expect(existsSync(exported)).toBe(true)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(exported)
    const sheet = workbook.getWorksheet('Invoices')
    expect(sheet).toBeDefined()
    const header = sheet!.getRow(1)
    let issuedCol = -1
    header.eachCell((cell, col) => {
      if (String(cell.value).trim().toLowerCase() === 'issued') issuedCol = col
    })
    expect(issuedCol).toBeGreaterThan(0)
    const futureDay = new Date(`${future}T00:00:00Z`).getUTCDate()
    let sawFuture = false
    sheet!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const cell = row.getCell(issuedCol)
      if (cell.value instanceof Date) {
        // Wall-date serial: UTC day must equal the paper day (never shifted).
        expect(cell.value.getUTCDate()).toBeGreaterThan(0)
        if (
          cell.value.getUTCFullYear() === Number(future.slice(0, 4)) &&
          cell.value.getUTCMonth() === Number(future.slice(5, 7)) - 1 &&
          cell.value.getUTCDate() === futureDay
        ) {
          sawFuture = true
          expect(cell.numFmt).toBe('dd MMM yyyy')
        }
      }
    })
    expect(sawFuture).toBe(true)
  } finally {
    if (exported && existsSync(exported)) unlinkSync(exported)
    await app.close()
  }
})

test('renew shortcut from the customer current-membership card', async () => {
  const { app, page } = await launchFreshApp()
  try {
    await createLead(page, 'Vikram Rao', '9876543213')

    await page.getByRole('button', { name: /new membership sale/i }).click()
    await expect(page.getByRole('heading', { name: 'Membership Sale' })).toBeVisible()
    await pickComboboxOption(page, 'Search a lead…', /search by name or phone/i, 'Vikram', /Vikram Rao/)
    await pickComboboxOption(page, 'Search a plan…', /search by plan name/i, 'Monthly', /Monthly/)
    await page.locator('#summary-paid').fill('100')
    await page.getByText('Choose method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await page.getByRole('button', { name: /sell & invoice/i }).click()
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 30_000 })

    // Customer record → Current membership card → Renew.
    await page.locator('nav').getByRole('link', { name: /^customers$/i }).click()
    await page.getByRole('row', { name: /vikram rao/i }).click()
    await page.waitForURL(/\/customers\/\d+/, { timeout: 30_000 })
    const card = page.locator('section', {
      has: page.getByRole('heading', { name: 'Current membership' })
    })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: /^renew$/i }).click()

    const dialog = page.getByRole('dialog', { name: /renew membership/i })
    await expect(dialog).toBeVisible()
    await dialog.getByText('Select method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await dialog.getByRole('button', { name: /renew membership/i }).click()
    await expect(page.getByText(/membership renewed/i)).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeHidden({ timeout: 15_000 })
  } finally {
    await app.close()
  }
})

test('renew shortcut from payments-due row and record drawer payment branch', async () => {
  const { app, page } = await launchFreshApp()
  try {
    await createLead(page, 'Kabir Singh', '9876543214')

    // Partial payment keeps an outstanding due on the dashboard.
    await page.getByRole('button', { name: /new membership sale/i }).click()
    await expect(page.getByRole('heading', { name: 'Membership Sale' })).toBeVisible()
    await pickComboboxOption(page, 'Search a lead…', /search by name or phone/i, 'Kabir', /Kabir Singh/)
    await pickComboboxOption(page, 'Search a plan…', /search by plan name/i, 'Monthly', /Monthly/)
    await page.locator('#summary-paid').fill('100')
    await page.getByText('Choose method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await page.getByRole('button', { name: /sell & invoice/i }).click()
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 30_000 })

    await page.locator('nav').getByRole('link', { name: /^dashboard$/i }).click()
    await expect(page.getByText(/payments due/i)).toBeVisible({ timeout: 15_000 })
    const dues = page.getByTestId('payments-due-table')

    // Row action opens the renew dialog resolved from the backend membership.
    await dues.getByRole('button', { name: /renew kabir singh membership/i }).click()
    const dialog = page.getByRole('dialog', { name: /renew membership/i })
    await expect(dialog).toBeVisible()
    await dialog.getByText('Select method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await dialog.getByRole('button', { name: /renew membership/i }).click()
    await expect(page.getByText(/membership renewed/i)).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Record drawer payment branch offers the same shortcut (assert + cancel:
    // a second renewal would overlap the just-created period).
    await dues.getByRole('button', { name: /view kabir singh details/i }).click()
    const sheet = page.getByRole('dialog', { name: /kabir singh/i })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /renew membership/i }).click()
    const dialog2 = page.getByRole('dialog', { name: /renew membership/i })
    await expect(dialog2).toBeVisible()
    await dialog2.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog2).toBeHidden()
  } finally {
    await app.close()
  }
})

test('renew shortcut from expirations row and record drawer', async () => {
  const { app, page } = await launchFreshApp()
  try {
    await createLead(page, 'Neha Kapoor', '9876543212')

    // Monthly sale with defaults: 30-day window lands inside the 30-day
    // expirations query, so the dashboard row appears immediately.
    await page.getByRole('button', { name: /new membership sale/i }).click()
    await expect(page.getByRole('heading', { name: 'Membership Sale' })).toBeVisible()
    await pickComboboxOption(page, 'Search a lead…', /search by name or phone/i, 'Neha', /Neha Kapoor/)
    await pickComboboxOption(page, 'Search a plan…', /search by plan name/i, 'Monthly', /Monthly/)
    await page.locator('#summary-paid').fill('100')
    await page.getByText('Choose method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await page.getByRole('button', { name: /sell & invoice/i }).click()
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 30_000 })

    await page.locator('nav').getByRole('link', { name: /^dashboard$/i }).click()
    await expect(page.getByText(/membership expirations/i)).toBeVisible({ timeout: 15_000 })

    // Row action opens the renew dialog with the next period prefilled.
    // (Scoped to the expirations card: the member also appears in Payments due.)
    const expirations = page.getByTestId('membership-expirations-table')
    await expirations.getByRole('button', { name: /renew neha kapoor membership/i }).click()
    const dialog = page.getByRole('dialog', { name: /renew membership/i })
    await expect(dialog).toBeVisible()
    await dialog.getByText('Select method', { exact: true }).click()
    await page.getByRole('option', { name: 'UPI', exact: true }).click()
    await dialog.getByRole('button', { name: /renew membership/i }).click()
    await expect(page.getByText(/membership renewed/i)).toBeVisible({ timeout: 30_000 })
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    // Record drawer footer offers the same shortcut.
    await expirations.getByRole('button', { name: /view neha kapoor details/i }).click()
    const sheet = page.getByRole('dialog', { name: /neha kapoor/i })
    await expect(sheet).toBeVisible()
    await sheet.getByRole('button', { name: /renew membership/i }).click()
    const dialog2 = page.getByRole('dialog', { name: /renew membership/i })
    await expect(dialog2).toBeVisible()
    await dialog2.getByRole('button', { name: /cancel/i }).click()
    await expect(dialog2).toBeHidden()
  } finally {
    await app.close()
  }
})
