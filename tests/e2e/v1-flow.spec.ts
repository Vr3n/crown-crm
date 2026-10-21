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
 * End to end: first run setup, masters, a purchase, a sale, a receipt with an
 * allocation, then the reports and stock read models. Data is seeded through
 * the same preload bridge the screens use, so the IPC, posting engine and SQLite
 * file are all exercised. The setup screen and the report screens are driven
 * through the UI.
 */

interface E2EApi {
  parties: {
    create: (input: Record<string, unknown>) => Promise<{ id: number; name: string }>
  }
  items: {
    create: (input: Record<string, unknown>) => Promise<{ id: number; name: string }>
  }
  vouchers: {
    post: (input: Record<string, unknown>) => Promise<{ id: number; number: string }>
    outstanding: (input: Record<string, unknown>) => Promise<unknown[]>
  }
}

const userData = mkdtempSync(join(tmpdir(), 'crown-books-e2e-'))
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

async function waitForApi(): Promise<void> {
  await page.waitForFunction(() => Boolean((window as unknown as { api?: unknown }).api))
}

async function goto(hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target
  }, hash)
  await page.waitForTimeout(250)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await launch()
})

test.afterAll(async () => {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('first run creates the company and opens the dashboard', async () => {
  await page.getByText('Set up the books').waitFor()
  await page.getByLabel('Business name').fill('Acme Distributors')
  await page.getByLabel('Owner name').fill('Viren Patel')
  await page.getByLabel('Phone (optional)').fill('9876543210')
  await page.getByLabel('Owner email').fill('owner@acme.in')
  await page.locator('input[type="password"]').first().fill('correct-horse')
  await page.getByLabel('GSTIN (optional)').fill('27AABFU4477G1ZY')
  await page.getByRole('button', { name: 'Create company and sign in' }).click()

  await expect(page.getByText('Crown Books').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create company and sign in' })).toHaveCount(0)
  await waitForApi()
})

test('masters, purchase, sale, receipt and reports flow end to end', async () => {
  const ids = await page.evaluate(async () => {
    const api = (window as unknown as { api: E2EApi }).api
    const customer = await api.parties.create({
      name: 'Acme Distributor',
      phone: '9000000001',
      email: null,
      gstin: '27AABFU4477G1ZY',
      stateCode: '27',
      billingAddress: null,
      isCustomer: true,
      isSupplier: false,
      creditDays: 30,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    })
    const supplier = await api.parties.create({
      name: 'TechConnect',
      phone: '9000000002',
      email: null,
      gstin: '27CRBPJ7020H1Z0',
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
    const item = await api.items.create({
      name: 'SSD 256GB',
      sku: 'SSD-256',
      hsnSac: '8523',
      uomId: null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 385593,
      purchasePriceMinor: 300000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    })
    return { customerId: customer.id, supplierId: supplier.id, itemId: item.id }
  })

  const posted = await page.evaluate(async (data) => {
    const api = (window as unknown as { api: E2EApi }).api
    const purchase = await api.vouchers.post({
      requestId: 'e2e-purchase-1',
      type: 'PURCHASE',
      date: '2026-07-13',
      dueDate: null,
      partyId: data.supplierId,
      placeOfSupplyStateCode: '27',
      narration: 'Opening stock purchase',
      referenceNo: 'TC/2026-27/583',
      lines: [
        {
          itemId: data.itemId,
          description: 'SSD 256GB',
          hsn: '8523',
          uom: 'Nos',
          qtyE4: 100000,
          rateMinor: 300000,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800,
          godownId: null
        }
      ],
      journalLines: [],
      allocations: [],
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })

    const sale = await api.vouchers.post({
      requestId: 'e2e-sale-1',
      type: 'SALES',
      date: '2026-09-11',
      dueDate: null,
      partyId: data.customerId,
      placeOfSupplyStateCode: '27',
      narration: 'SSD sale',
      referenceNo: null,
      lines: [
        {
          itemId: data.itemId,
          description: 'EVM 256GB SATA SSD',
          hsn: '8523',
          uom: 'Nos',
          qtyE4: 10000,
          rateMinor: 385593,
          rateIncludesTax: false,
          discountBps: 0,
          gstRateBps: 1800,
          godownId: null
        }
      ],
      journalLines: [],
      allocations: [],
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })

    const receipt = await api.vouchers.post({
      requestId: 'e2e-receipt-1',
      type: 'RECEIPT',
      date: '2026-10-05',
      dueDate: null,
      partyId: data.customerId,
      placeOfSupplyStateCode: null,
      narration: 'Part payment',
      referenceNo: null,
      lines: [],
      journalLines: [],
      allocations: [{ toVoucherId: sale.id, amountMinor: 150000, type: 'AGAINST_REF' }],
      amountMinor: 200000,
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })

    return { purchase, sale, receipt }
  }, ids)

  expect(posted.purchase.number).toBe('PUR/0001')
  expect(posted.sale.number).toBe('INV/0001')
  expect(posted.receipt.number).toBe('RCT/0001')

  await goto('#/reports/receivables')
  await expect(page.getByText('Acme Distributor').first()).toBeVisible()
  await expect(page.getByText(/3,050\.00/).first()).toBeVisible()

  await goto('#/reports/trial-balance')
  await expect(page.getByText('Debits equal credits.')).toBeVisible()

  await goto('#/stock')
  await expect(page.getByText('SSD 256GB').first()).toBeVisible()
  await expect(page.getByText('9').first()).toBeVisible()

  await goto('#/day-book')
  await expect(page.getByText('RCT/0001').first()).toBeVisible()
})

test('data survives an app restart', async () => {
  await app.close()
  await launch()
  await page.getByText('Crown Books').first().waitFor()
  await expect(page.getByText(/Receivables/).first()).toBeVisible()
  await goto('#/reports/receivables')
  await expect(page.getByText(/3,050\.00/).first()).toBeVisible()
})
