/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Captures the small list/screen-flow thumbnails used by the quick start.
 *
 *   node scripts/guide/capture-quick-lists.mjs
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const shots = join(root, 'docs/guides/assets/screens')
const userData = mkdtempSync(join(tmpdir(), 'crown-quick-'))
mkdirSync(shots, { recursive: true })

let app
try {
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, CROWN_BOOKS_E2E: '1', CROWN_BOOKS_USER_DATA: userData }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(700)

  await page.getByText('Set up the books').first().waitFor()
  await page.getByLabel('Business name').fill('Crown Traders')
  await page.getByLabel('Owner name').fill('Priya Sharma')
  await page.getByLabel('Owner email').fill('owner@crowntraders.in')
  await page.locator('input[type="password"]').first().fill('crownbooks')
  await page.getByLabel('GSTIN (optional)').fill('27AABCT1234F1Z5')
  await page.locator('#setup-books-begin').fill('2026-04-01')
  await page.getByRole('button', { name: 'Create company and sign in' }).click()
  await page.getByRole('heading', { name: 'Number your vouchers' }).waitFor()
  await page.getByRole('button', { name: 'Save numbering' }).click()
  await page.getByRole('heading', { name: 'Walk through the main flow' }).waitFor()
  await page.getByRole('button', { name: 'Skip the tour' }).click()
  await page.getByText('Good ', { exact: false }).first().waitFor()

  await page.evaluate(async () => {
    const api = window.api
    const units = await api.units.list({ includeInactive: false })
    const nos = units.find((unit) => /^nos$/i.test(unit.name) || /^nos$/i.test(unit.symbol))
    const customer = await api.parties.create({
      name: 'Sharma Electronics',
      phone: '9820011001',
      email: 'accounts@sharmaelectronics.in',
      gstin: '27AABCS1234D1Z5',
      stateCode: '27',
      billingAddress: '14, Laxmi Road, Pune 411002',
      isCustomer: true,
      isSupplier: false,
      creditDays: 30,
      creditLimitMinor: 5000000,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    })
    const supplier = await api.parties.create({
      name: 'TechConnect Distributors',
      phone: '9822011003',
      email: 'sales@techconnect.in',
      gstin: '27AABCT9012F1Z9',
      stateCode: '27',
      billingAddress: '22, MIDC, Pune 411019',
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
      uomId: nos?.id ?? null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 385593,
      purchasePriceMinor: 300000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    })

    const line = {
      itemId: item.id,
      description: item.name,
      hsn: item.hsnSac,
      uom: 'Nos',
      qtyE4: 100000,
      rateMinor: 300000,
      rateIncludesTax: false,
      discountBps: 0,
      gstRateBps: 1800,
      godownId: null
    }
    await api.vouchers.post({
      requestId: 'quick-pur-1',
      type: 'PURCHASE',
      date: '2026-10-20',
      dueDate: '2026-11-19',
      partyId: supplier.id,
      placeOfSupplyStateCode: '27',
      narration: 'October stock',
      referenceNo: 'TC/26-27/604',
      lines: [line],
      journalLines: [],
      allocations: []
    })
    await api.vouchers.post({
      requestId: 'quick-inv-1',
      type: 'SALES',
      date: '2026-10-21',
      dueDate: '2026-11-20',
      partyId: customer.id,
      placeOfSupplyStateCode: '27',
      narration: 'Counter sale',
      referenceNo: 'PO-1088',
      lines: [line],
      journalLines: [],
      allocations: []
    })
  })

  await page.reload()
  await page.getByText('Good ', { exact: false }).first().waitFor()
  await page.waitForTimeout(800)

  async function shot(hash, name, waitFor) {
    await page.evaluate((next) => {
      window.location.hash = next
    }, hash)
    await page.waitForTimeout(500)
    await page.getByText(waitFor, { exact: false }).first().waitFor()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(250)
    await page.screenshot({
      path: join(shots, `${name}.png`),
      clip: { x: 216, y: 40, width: 1560, height: 330 }
    })
    console.log(`captured ${name}`)
  }

  async function full(hash, name, waitFor) {
    await page.evaluate((next) => {
      window.location.hash = next
    }, hash)
    await page.waitForTimeout(500)
    await page.getByText(waitFor, { exact: false }).first().waitFor()
    await page.mouse.move(4, 4)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(shots, `${name}.png`) })
    console.log(`captured ${name}`)
  }

  await shot('#/parties', 'quick-flow-parties', 'Sharma Electronics')
  await full('#/parties', 'quick-full-parties', 'Sharma Electronics')
  await shot('#/items', 'quick-flow-items', 'SSD 256GB')
  await full('#/items', 'quick-full-items', 'SSD 256GB')
  await shot('#/purchases', 'quick-flow-purchases', 'PUR/0001')
  await full('#/purchases', 'quick-full-purchases', 'PUR/0001')
  await shot('#/sales', 'quick-flow-sales', 'INV/0001')
  await full('#/sales', 'quick-full-sales', 'INV/0001')
  await full('#/receipts', 'quick-full-receipts', 'Receipts')
  await full('#/payments', 'quick-full-payments', 'Payments')
  await full('#/journals', 'quick-full-journals', 'Journals')
  await page.evaluate(() => {
    window.location.hash = '#/settings/backup'
  })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Create backup' }).click()
  await page
    .getByText(/crown-books-.*\.db/)
    .first()
    .waitFor()
  await page.mouse.move(4, 4)
  await page.waitForTimeout(250)
  await page.screenshot({
    path: join(shots, 'quick-flow-backup.png'),
    clip: { x: 216, y: 40, width: 1560, height: 330 }
  })
  await page.screenshot({ path: join(shots, 'quick-full-backup.png') })
  console.log('captured quick-flow-backup')
} finally {
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
}
