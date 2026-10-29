import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { quietApp } from './support/silent'

/**
 * Visual phase walkthrough. Every step drives the real UI and leaves a
 * screenshot under docs/e2e-screens for the stakeholder report.
 */

const shots = join(process.cwd(), 'docs', 'e2e-screens')
const userData = mkdtempSync(join(tmpdir(), 'crown-books-flow-'))
let app: ElectronApplication
let page: Page
let step = 0

async function shot(name: string): Promise<void> {
  step += 1
  await page.waitForTimeout(250)
  await page.screenshot({ path: join(shots, `${String(step).padStart(2, '0')}-${name}.png`) })
}

async function go(hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForTimeout(300)
}

/** Finish first run (numbering) so the phase screenshots stay focused. */
async function completeOnboarding(): Promise<void> {
  await page.waitForFunction(() =>
    Boolean((window as unknown as { api?: { numbering?: unknown } }).api?.numbering)
  )
  await page.evaluate(async () => {
    const api = (window as unknown as { api: Record<string, never> }).api as unknown as {
      numbering: {
        list: () => Promise<Record<string, unknown>[]>
        update: (input: Record<string, unknown>) => Promise<unknown>
      }
    }
    const rows = await api.numbering.list()
    await api.numbering.update({ requestId: `e2e-${Date.now()}`, items: rows })
  })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => Boolean((window as unknown as { api?: unknown }).api))
  await page.evaluate(() => {
    window.location.hash = '#/'
  })
  await page.waitForTimeout(300)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  mkdirSync(shots, { recursive: true })
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      CROWN_BOOKS_E2E: '1',
      CROWN_BOOKS_USER_DATA: userData
    }
  })
  await quietApp(app)
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('P0: first run, company setup and shell', async () => {
  await page.getByText('Set up the books').first().waitFor()
  await shot('setup-empty')

  await page.getByLabel('Business name').fill('Acme Distributors')
  await page.getByLabel('Owner name').fill('Viren Patel')
  await page.getByLabel('Mobile (optional)').fill('9876543210')
  await page.getByLabel('Owner email').fill('owner@acme.in')
  await page.locator('input[type="password"]').first().fill('correct-horse')
  await page.getByLabel('GSTIN (optional)').fill('27AABFU4477G1ZY')
  await page.getByRole('button', { name: 'Create company and sign in' }).click()

  await page.getByRole('heading', { name: 'Number your vouchers' }).waitFor()
  await completeOnboarding()
  await page.getByText('Good ', { exact: false }).first().waitFor()
  await shot('dashboard-empty')
})

test('P1: parties, items, chart of accounts and company', async () => {
  // Customer
  await go('#/parties')
  await page.getByRole('button', { name: 'New party' }).first().click()
  await page.getByLabel(/^Name/).fill('Acme Distributor')
  await page.getByLabel('Mobile', { exact: true }).fill('9000000001')
  await page.getByLabel('GSTIN', { exact: true }).fill('27AABFU4477G1ZY')
  await page.getByRole('textbox', { name: 'State code' }).fill('27')
  await page.getByRole('textbox', { name: 'Credit days' }).fill('30')
  await page.getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByText('Acme Distributor').first()).toBeVisible()

  // Supplier
  await page.getByRole('button', { name: 'New party' }).first().click()
  await page.getByLabel(/^Name/).fill('TechConnect')
  await page.getByLabel('Mobile', { exact: true }).fill('9000000002')
  await page.getByLabel('Customer').click()
  await page.getByLabel('Supplier').click()
  await page.getByRole('textbox', { name: 'Credit days' }).fill('30')
  await page.getByRole('button', { name: 'Add party' }).click()
  await expect(page.getByText('TechConnect').first()).toBeVisible()
  await shot('parties-list')

  // Item
  await go('#/items')
  await page.getByRole('button', { name: 'New item' }).first().click()
  await page.getByLabel(/^Name/).fill('SSD 256GB')
  await page.getByRole('textbox', { name: 'SKU' }).fill('SSD-256')
  await page.getByRole('textbox', { name: 'HSN / SAC' }).fill('8523')
  await page.locator('#item-unit').click()
  await page.getByRole('option', { name: /Nos/ }).click()
  await page.locator('#item-gst').click()
  await page.getByRole('option', { name: '18%' }).click()
  await page.getByRole('textbox', { name: 'Sale price (INR)' }).fill('3855.93')
  await page.getByRole('textbox', { name: 'Purchase price (INR)' }).fill('3000')
  await page.getByRole('button', { name: 'Add item' }).click()
  await expect(page.getByText('SSD 256GB').first()).toBeVisible()
  await shot('items-list')

  await go('#/masters/accounts')
  await page.getByText('Sales', { exact: true }).first().waitFor()
  await shot('chart-of-accounts')

  await go('#/settings/company')
  await page.getByLabel('Registered name').first().waitFor()
  await expect(page.getByText('Numbering set', { exact: true })).toBeVisible()
  await expect(page.getByText('Books begin', { exact: true })).toBeVisible()
  await shot('company-settings')
})

test('P2 and P4: purchase bill, payment, posting and trial balance', async () => {
  await go('#/purchases/new')
  await page.getByRole('combobox', { name: 'Select supplier' }).click()
  await page.getByRole('option', { name: /TechConnect/ }).click()
  await page.getByRole('combobox', { name: 'Choose item or use free text' }).click()
  await page.getByRole('option', { name: /SSD 256GB/ }).click()
  await page.getByLabel('Qty for line 1').fill('10')
  await page.getByLabel('Rate for line 1').fill('3000')
  await shot('purchase-entry')
  await page.getByRole('button', { name: 'Post bill' }).click()
  await expect(page.getByText('PUR/0001').first()).toBeVisible()
  await shot('purchase-detail')

  await go('#/payments/new')
  await page.getByLabel('Party').selectOption({ index: 1 })
  await page.getByLabel('Amount').fill('10000')
  await page.getByLabel('Allocate to PUR/0001').fill('10000')
  await shot('payment-entry')
  await page.getByRole('button', { name: /Post payment/i }).click()
  await expect(page.getByText('PAY/0001').first()).toBeVisible()
  await shot('payment-detail')

  await go('#/reports/payables')
  await expect(page.getByText('TechConnect').first()).toBeVisible()
  await shot('payables')

  await go('#/reports/trial-balance')
  await expect(page.getByText('Debits equal credits.')).toBeVisible()
  await shot('trial-balance')
})

test('P3: sales invoice, receipt with allocation, receivables and ageing', async () => {
  await go('#/sales/new')
  await page.getByRole('combobox', { name: 'Select customer' }).click()
  await page.getByRole('option', { name: /Acme Distributor/ }).click()
  await page.getByRole('combobox', { name: 'Choose item or use free text' }).click()
  await page.getByRole('option', { name: /SSD 256GB/ }).click()
  await page.getByLabel('Qty for line 1').fill('1')
  await shot('sales-entry')
  await page.getByRole('button', { name: 'Post invoice' }).click()
  await expect(page.getByText('INV/0001').first()).toBeVisible()
  await shot('sales-detail')

  await go('#/receipts/new')
  await page.getByLabel('Party').selectOption({ index: 1 })
  await page.getByLabel('Amount').fill('2000')
  await page.getByLabel('Allocate to INV/0001').fill('1500')
  await shot('receipt-entry')
  await page.getByRole('button', { name: /Post receipt/i }).click()
  await expect(page.getByText('RCT/0001').first()).toBeVisible()
  await shot('receipt-detail')

  await go('#/reports/receivables')
  await expect(page.getByText('3,050.00').first()).toBeVisible()
  await shot('receivables')

  await go('#/reports/ageing')
  await expect(page.getByText('Acme Distributor').first()).toBeVisible()
  await shot('ageing')
})

test('P3: sales invoice exports a two-copy PDF and prints both copies', async () => {
  await go('#/sales')
  const href = await page.getByRole('link', { name: 'INV/0001' }).first().getAttribute('href')
  const voucherId = Number(/(\d+)$/.exec(href ?? '')?.[1] ?? 0)
  expect(voucherId).toBeGreaterThan(0)

  await page.getByRole('link', { name: 'INV/0001' }).first().click()
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeVisible()

  const invoiceDir = mkdtempSync(join(tmpdir(), 'crown-books-invoice-'))
  await app.evaluate(async ({ dialog }, dir) => {
    const store = globalThis as unknown as { __crownInvoiceName?: string }
    store.__crownInvoiceName = ''
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args[args.length - 1] as { defaultPath?: string }
      store.__crownInvoiceName = options.defaultPath ?? ''
      return { canceled: false, filePath: `${dir}/${options.defaultPath}` }
    }) as typeof dialog.showSaveDialog
  }, invoiceDir)

  await page.getByRole('button', { name: 'Export PDF' }).click()
  await expect(page.getByText('Invoice PDF saved')).toBeVisible()

  const savedName = await app.evaluate(
    () => (globalThis as unknown as { __crownInvoiceName?: string }).__crownInvoiceName ?? ''
  )
  expect(savedName).toMatch(/^Acme-Distributor_Sales_INV-0001_\d{8}-\d{6}\.pdf$/)
  const savedPath = join(invoiceDir, savedName)
  expect(existsSync(savedPath)).toBe(true)
  const pdf = readFileSync(savedPath)
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  const pageCount = pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length ?? 0
  expect(pageCount).toBe(2)
  rmSync(invoiceDir, { recursive: true, force: true })

  await go(`#/print/vouchers/${voucherId}`)
  await page.getByText('ORIGINAL FOR RECIPIENT').first().waitFor()
  await expect(page.getByText('ORIGINAL FOR RECIPIENT').first()).toBeVisible()
  await expect(page.getByText('DUPLICATE FOR TRANSPORTER').first()).toBeVisible()
  await expect(page.getByText('TAX INVOICE').first()).toBeVisible()

  // A purchase print reproduces the supplier's tax invoice: the supplier is
  // the issuer and our company is the buyer.
  await go('#/purchase')
  const purchaseHref = await page.getByRole('link', { name: /PUR\// }).first().getAttribute('href')
  const purchaseId = Number(/(\d+)$/.exec(purchaseHref ?? '')?.[1] ?? 0)
  expect(purchaseId).toBeGreaterThan(0)

  await go(`#/print/vouchers/${purchaseId}`)
  await page.getByText('ORIGINAL FOR RECIPIENT').first().waitFor()
  const purchaseSheet = page.locator('article').first()
  await expect(purchaseSheet.getByText('TAX INVOICE')).toBeVisible()
  await expect(purchaseSheet.getByText('Supplier Bill No.')).toBeVisible()
  await expect(purchaseSheet.getByText('TechConnect').first()).toBeVisible()
  await expect(purchaseSheet.getByText('Supplier', { exact: true })).toBeVisible()
  await expect(purchaseSheet.getByText('Buyer', { exact: true })).toBeVisible()
  await expect(purchaseSheet.getByText('Acme Distributors').first()).toBeVisible()
})

test('P5 and P6: stock, registers, profit and loss, balance sheet', async () => {
  await go('#/stock')
  await expect(page.getByText('SSD 256GB').first()).toBeVisible()
  await shot('stock-summary')

  await go('#/reports/sales-register')
  await expect(page.getByText('INV/0001').first()).toBeVisible()
  await shot('sales-register')

  await go('#/reports/purchase-register')
  await expect(page.getByText('PUR/0001').first()).toBeVisible()
  await shot('purchase-register')

  await go('#/reports/profit-loss')
  await expect(page.getByText('Net profit').first()).toBeVisible()
  await shot('profit-and-loss')

  await go('#/reports/balance-sheet')
  await expect(page.getByText(/Assets equal liabilities/)).toBeVisible()
  await shot('balance-sheet')
})

test('P6: a report exports to a real spreadsheet', async () => {
  const target = join(tmpdir(), `crown-books-xlsx-${Date.now()}.xlsx`)
  await app.evaluate(async ({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, target)

  await go('#/reports/sales-register')
  await expect(page.getByText('INV/0001').first()).toBeVisible()
  await page.getByRole('button', { name: 'XLSX' }).click()
  await expect(page.getByText('Spreadsheet saved')).toBeVisible()
  expect(existsSync(target)).toBe(true)
  rmSync(target, { force: true })
})

test('P2 and P8: journals, contra and backup', async () => {
  await go('#/journals')
  await expect(page.getByText('Value adjusted', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New contra' }).click()
  await page.locator('#contra-from').waitFor()
  await page.locator('#contra-from').selectOption({ index: 1 })
  await page.locator('#contra-to').selectOption({ index: 2 })
  await page.locator('#contra-amount').fill('500')
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.getByText('CTR/0001').first()).toBeVisible()
  await shot('journals-contra')

  await page.getByRole('link', { name: 'CTR/0001' }).click()
  await expect(page.getByText('Contra entry', { exact: true })).toBeVisible()
  await expect(page.getByText('POSTED', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^Created /)).toBeVisible()

  await go('#/settings/backup')
  await page.getByRole('button', { name: 'Create backup' }).click()
  await expect(page.getByText(/crown-books-/).first()).toBeVisible()
  await shot('backup')
})

test('restart: the books survive', async () => {
  await app.close()
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      CROWN_BOOKS_E2E: '1',
      CROWN_BOOKS_USER_DATA: userData
    }
  })
  await quietApp(app)
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('Receivables', { exact: false }).first().waitFor()
  await shot('restart-dashboard')

  await go('#/reports/receivables')
  await expect(page.getByText('3,050.00').first()).toBeVisible()
  await shot('restart-receivables')
})
