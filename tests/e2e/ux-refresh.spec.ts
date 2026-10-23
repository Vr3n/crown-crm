import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The UX refresh flow: first run numbering, the tour, reactive forms, the new
 * purchase bill pickers and a dashboard that reflects real rows.
 */

const userData = mkdtempSync(join(tmpdir(), 'crown-books-ux-'))
const YEAR_MONTH = new Date().toISOString().slice(0, 7).replace('-', '')
let app: ElectronApplication
let page: Page

async function launch(): Promise<void> {
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      CROWN_BOOKS_E2E: '1',
      CROWN_BOOKS_USER_DATA: userData
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}

async function goto(hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForTimeout(300)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await launch()
})

test.afterAll(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('first run numbers the books and finishes the tour', async () => {
  await page.getByText('Set up the books').waitFor()
  await page.getByLabel('Business name').fill('Acme Distributors')
  await page.getByLabel('Owner name').fill('Viren Patel')
  await page.getByLabel('Owner email').fill('owner@acme.in')
  await page.locator('input[type="password"]').first().fill('correct-horse')
  await page.getByRole('button', { name: 'Create company and sign in' }).click()

  await page.getByRole('heading', { name: 'Number your vouchers' }).waitFor()

  const purchasePrefix = page.getByLabel('Purchase bill prefix')
  await purchasePrefix.fill('PUR/{YYYYMM}')
  await page.getByLabel('Purchase bill width').fill('3')
  await page.getByLabel('Purchase bill reset period').selectOption('MONTHLY')
  await expect(page.getByText(`PUR/${YEAR_MONTH}001`).first()).toBeVisible()

  await page.getByRole('button', { name: 'Save numbering' }).click()
  await page.getByRole('heading', { name: 'Walk through the main flow' }).waitFor()

  await page.getByRole('button', { name: 'Skip the tour' }).click()
  await page.getByText('Set up the books').waitFor()
  await expect(page.getByText('What this version does')).toHaveCount(0)
  await expect(page.getByText('A note on data')).toHaveCount(0)
  await expect(page.getByText('1 of 6 steps done.')).toBeVisible()
})

test('the party dialog validates live and marks required fields', async () => {
  await goto('#/parties')
  await page.getByRole('button', { name: 'New party' }).first().click()

  await expect(page.getByText('Required fields')).toBeVisible()
  await page.getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByText('Party name is required')).toBeVisible()
  await expect(page.locator('#name')).toBeFocused()

  await page.locator('#name').fill('Sharma Traders')
  await page.locator('#email').fill('not-an-email')
  await page.locator('#name').click()
  await expect(page.getByText('Enter a valid email')).toBeVisible()

  await page.locator('#email').fill('books@example.com')
  await expect(page.getByText('Enter a valid email')).toHaveCount(0)

  await page.getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByText('Sharma Traders').first()).toBeVisible()
})

test('an item is captured with required state and help', async () => {
  await goto('#/items')
  await page.getByRole('button', { name: 'New item' }).first().click()

  await expect(page.getByText('Required fields')).toBeVisible()
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByText('Item name is required')).toBeVisible()

  await page.getByLabel(/^Name/).fill('SSD 256GB')
  await page.getByRole('textbox', { name: 'Purchase price (INR)' }).fill('3000')
  await page.getByRole('textbox', { name: 'Sale price (INR)' }).fill('4000')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByText('SSD 256GB').first()).toBeVisible()
})

test('parties, items and stock show contextual headings and metrics', async () => {
  const main = page.getByRole('main')

  await goto('#/customers')
  await expect(main.getByRole('heading', { name: 'Customers', exact: true })).toBeVisible()
  await expect(main.getByText('Receivables', { exact: true })).toBeVisible()

  await goto('#/suppliers')
  await expect(main.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(main.getByText('Payables', { exact: true })).toBeVisible()

  await goto('#/parties')
  await expect(main.getByRole('heading', { name: 'Parties', exact: true })).toBeVisible()

  await goto('#/items')
  await expect(main.getByText('Inventory value')).toBeVisible()
  await expect(main.getByText('Stock value by item')).toBeVisible()

  await goto('#/stock')
  await expect(main.getByRole('heading', { name: 'Stock Summary' })).toBeVisible()
  await expect(main.getByText('Units on hand')).toBeVisible()
})

test('the purchase bill exposes the supplier picker and posts', async () => {
  const supplierId = await page.evaluate(async () => {
    const api = (window as unknown as { api: Record<string, never> }).api as unknown as {
      parties: {
        create: (input: Record<string, unknown>) => Promise<{ id: number }>
      }
    }
    const supplier = await api.parties.create({
      name: 'TechConnect',
      phone: '9000000002',
      email: null,
      gstin: null,
      stateCode: '27',
      billingAddress: null,
      isCustomer: false,
      isSupplier: true,
      creditDays: 30,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    })
    return supplier.id
  })
  expect(supplierId).toBeGreaterThan(0)

  await goto('#/purchases/new')
  const supplier = page.getByRole('combobox', { name: 'Select supplier' })
  await expect(supplier).toBeVisible()
  await supplier.click()
  await page.getByPlaceholder('Search suppliers').fill('TechConnect')
  await page.getByRole('option', { name: /TechConnect/ }).click()

  await page.getByRole('combobox', { name: 'Choose item or use free text' }).click()
  await page.getByPlaceholder('Search item name, SKU or HSN').fill('SSD')
  await page.getByRole('option', { name: /SSD 256GB/ }).click()

  await page.getByRole('button', { name: 'Post bill' }).click()
  await expect(page.getByText(new RegExp(`PUR/${YEAR_MONTH}001`)).first()).toBeVisible()
})

test('the dashboard reflects the records and shows the trends', async () => {
  await goto('#/')

  await expect(page.getByText('4 of 6 steps done.')).toBeVisible()
  await expect(page.getByText('TechConnect').first()).toBeVisible()
  await expect(page.getByLabel('Sales and purchases for the last six months')).toBeVisible()
  await expect(page.getByLabel('Open receivables and payables by age')).toBeVisible()

  await goto('#/reports/trial-balance')
  await expect(page.getByRole('main').getByRole('heading', { name: 'Trial Balance' })).toBeVisible()
  await expect(page.getByText('Total debit', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible()
})
