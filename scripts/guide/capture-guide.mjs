/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Captures the screenshots used by the Crown Books user guide.
 *
 * Run after `electron-vite build`:
 *   node scripts/guide/capture-guide.mjs
 *
 * It creates a throwaway company with realistic data, screenshots each screen,
 * and records the position of the callouts so the PDF can place numbered
 * markers over the image without hand measuring.
 */
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const shotsDir = join(root, 'docs/guides/assets/screens')
const annotationsPath = join(root, 'docs/guides/assets/annotations.json')
const userData = mkdtempSync(join(tmpdir(), 'crown-guide-'))
mkdirSync(shotsDir, { recursive: true })

const annotations = {}
let app
let page

const wait = (ms = 350) => page.waitForTimeout(ms)

async function goto(hash) {
  await page.evaluate((next) => {
    window.location.hash = next
  }, hash)
  await wait(550)
}

async function snap(name, marks = []) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.move(4, 4)
  await wait(250)

  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  const placed = []
  for (const mark of marks) {
    const box = await mark.locator.boundingBox().catch(() => null)
    if (!box) {
      console.warn(`  ! marker ${mark.label} not found for ${name}`)
      continue
    }
    const rawX =
      mark.anchor === 'tl'
        ? box.x + 2
        : mark.anchor === 'tr'
          ? box.x + box.width - 2
          : box.x + box.width / 2
    const rawY = mark.anchor === 'tl' ? box.y + 2 : box.y + box.height / 2
    placed.push({
      label: mark.label,
      text: mark.text,
      xPct: Number(Math.min(97.5, Math.max(1.8, (rawX / viewport.width) * 100)).toFixed(2)),
      yPct: Number(Math.min(97.5, Math.max(1.5, (rawY / viewport.height) * 100)).toFixed(2))
    })
  }
  annotations[name] = placed
  await page.screenshot({ path: join(shotsDir, `${name}.png`) })
  console.log(`  captured ${name} (${placed.length} markers)`)
}

async function snapDialog(name, dialog, marks = []) {
  await page.mouse.move(4, 4)
  await wait(250)
  const box = await dialog.boundingBox()
  if (!box) throw new Error(`Dialog not visible for ${name}`)
  const pad = 16
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(1785, box.width + pad * 2),
    height: Math.min(1118, box.height + pad * 2)
  }
  const placed = []
  for (const mark of marks) {
    const target = await mark.locator.boundingBox().catch(() => null)
    if (!target) {
      console.warn(`  ! marker ${mark.label} not found for ${name}`)
      continue
    }
    const rawX =
      mark.anchor === 'tl'
        ? target.x + 2
        : mark.anchor === 'tr'
          ? target.x + target.width - 2
          : target.x + target.width / 2
    const rawY = mark.anchor === 'tl' ? target.y + 2 : target.y + target.height / 2
    placed.push({
      label: mark.label,
      text: mark.text,
      xPct: Number(Math.min(97.5, Math.max(1.5, ((rawX - clip.x) / clip.width) * 100)).toFixed(2)),
      yPct: Number(Math.min(97.5, Math.max(1.5, ((rawY - clip.y) / clip.height) * 100)).toFixed(2))
    })
  }
  annotations[name] = placed
  await page.screenshot({ path: join(shotsDir, `${name}.png`), clip })
  console.log(`  captured ${name} (${placed.length} markers, dialog crop)`)
}

async function hideToasts() {
  await page.addStyleTag({
    content: '[data-sonner-toaster]{display:none !important} *{caret-color:transparent !important}'
  })
}

try {
  app = await electron.launch({
    args: ['out/main/index.js', '--force-device-scale-factor=1.25'],
    env: { ...process.env, CROWN_BOOKS_E2E: '1', CROWN_BOOKS_USER_DATA: userData }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await wait(900)

  // ---------------------------------------------------------------- first run
  await page.getByText('Set up the books').first().waitFor()
  await snap('00-first-run', [
    {
      label: 1,
      text: 'Business name, owner and phone',
      locator: page.getByLabel('Business name'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Owner email is the sign-in name',
      locator: page.getByLabel('Owner email'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Password, at least 8 characters',
      locator: page.getByLabel('Password'),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'State and GSTIN decide the tax treatment',
      locator: page.getByLabel('State'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'First day of your books',
      locator: page.getByLabel('Books begin'),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Creates the company and signs you in',
      locator: page.getByRole('button', { name: 'Create company and sign in' })
    }
  ])

  await page.getByLabel('Business name').fill('Crown Traders')
  await page.getByLabel('Owner name').fill('Priya Sharma')
  await page.getByLabel('Phone (optional)').fill('98765 43210')
  await page.getByLabel('Owner email').fill('owner@crowntraders.in')
  await page.getByLabel('Password').fill('crownbooks')
  await page.getByLabel('GSTIN (optional)').fill('27AABCT1234F1Z5')
  await page.getByLabel('Books begin').fill('2026-04-01')
  await page.getByRole('button', { name: 'Create company and sign in' }).click()
  await page.getByText('Good ', { exact: false }).first().waitFor()
  await hideToasts()
  await wait(700)

  // --------------------------------------------------------------- demo data
  const data = await page.evaluate(async () => {
    const api = window.api
    const units = await api.units.list()
    const nos = units.find((unit) => /^nos$/i.test(unit.name) || /^nos$/i.test(unit.symbol))

    const party = (input) => api.parties.create(input)
    const customer1 = await party({
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
    const customer2 = await party({
      name: 'Mehta & Sons',
      phone: '9845011002',
      email: 'purchase@mehtaandsons.in',
      gstin: '29AABCM5678E1Z2',
      stateCode: '29',
      billingAddress: '8, Residency Road, Bengaluru 560025',
      isCustomer: true,
      isSupplier: false,
      creditDays: 15,
      creditLimitMinor: 3000000,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    })
    const supplier1 = await party({
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
    const supplier2 = await party({
      name: 'Prime Components',
      phone: '9879011004',
      email: 'orders@primecomponents.in',
      gstin: '27AABCP3456G1Z4',
      stateCode: '27',
      billingAddress: '5, Ring Road, Surat 395002',
      isCustomer: false,
      isSupplier: true,
      creditDays: 20,
      creditLimitMinor: 0,
      openingBalanceMinor: 0,
      openingBalanceDate: null,
      notes: null
    })

    const item = (input) => api.items.create(input)
    const ssd = await item({
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
      reorderLevelE4: 100000
    })
    const hub = await item({
      name: 'USB-C Hub',
      sku: 'HUB-7',
      hsnSac: '8473',
      uomId: nos?.id ?? null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 249900,
      purchasePriceMinor: 180000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 50000
    })
    const stand = await item({
      name: 'Laptop Stand',
      sku: 'STAND-AL',
      hsnSac: '8302',
      uomId: nos?.id ?? null,
      gstRateBps: 1800,
      isService: false,
      salePriceMinor: 129900,
      purchasePriceMinor: 85000,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    })
    const amc = await item({
      name: 'Annual Maintenance',
      sku: 'AMC-1',
      hsnSac: '998719',
      uomId: null,
      gstRateBps: 1800,
      isService: true,
      salePriceMinor: 500000,
      purchasePriceMinor: 0,
      openingQtyE4: 0,
      openingRateMinor: 0,
      reorderLevelE4: 0
    })

    const line = (entry, qty, rate, gst = 1800) => ({
      itemId: entry.id,
      description: entry.name,
      hsn: entry.hsnSac,
      uom: entry.isService ? '' : 'Nos',
      qtyE4: qty * 10000,
      rateMinor: rate,
      rateIncludesTax: false,
      discountBps: 0,
      gstRateBps: gst,
      godownId: null
    })

    const purchase1 = await api.vouchers.post({
      requestId: 'guide-pur-1',
      type: 'PURCHASE',
      date: '2026-07-13',
      dueDate: '2026-08-12',
      partyId: supplier1.id,
      placeOfSupplyStateCode: '27',
      narration: 'Storage and accessories for the festive season',
      referenceNo: 'TC/26-27/583',
      lines: [line(ssd, 100, 300000), line(hub, 25, 180000)],
      journalLines: [],
      allocations: []
    })
    const purchase2 = await api.vouchers.post({
      requestId: 'guide-pur-2',
      type: 'PURCHASE',
      date: '2026-08-02',
      dueDate: '2026-09-01',
      partyId: supplier2.id,
      placeOfSupplyStateCode: '27',
      narration: 'Desk accessories',
      referenceNo: 'PC/118',
      lines: [line(stand, 20, 85000)],
      journalLines: [],
      allocations: []
    })
    const sale1 = await api.vouchers.post({
      requestId: 'guide-inv-1',
      type: 'SALES',
      date: '2026-09-11',
      dueDate: '2026-10-11',
      partyId: customer1.id,
      placeOfSupplyStateCode: '27',
      narration: 'Supply of storage and accessories',
      referenceNo: 'PO-1042',
      lines: [line(ssd, 10, 385593), line(hub, 2, 249900)],
      journalLines: [],
      allocations: []
    })
    const sale2 = await api.vouchers.post({
      requestId: 'guide-inv-2',
      type: 'SALES',
      date: '2026-09-25',
      dueDate: '2026-10-10',
      partyId: customer2.id,
      placeOfSupplyStateCode: '29',
      narration: 'Annual maintenance and desk accessories',
      referenceNo: 'PO-221',
      lines: [line(stand, 5, 129900), line(amc, 1, 500000)],
      journalLines: [],
      allocations: []
    })
    await api.vouchers.post({
      requestId: 'guide-rct-1',
      type: 'RECEIPT',
      date: '2026-10-06',
      dueDate: null,
      partyId: customer1.id,
      placeOfSupplyStateCode: null,
      narration: 'Part payment against INV/0001',
      referenceNo: 'UPI/884120',
      lines: [],
      journalLines: [],
      allocations: [{ toVoucherId: sale1.id, amountMinor: 1500000, type: 'AGAINST_REF' }],
      amountMinor: 2000000,
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })
    await api.vouchers.post({
      requestId: 'guide-rct-2',
      type: 'RECEIPT',
      date: '2026-10-12',
      dueDate: null,
      partyId: customer2.id,
      placeOfSupplyStateCode: null,
      narration: 'Advance against INV/0002',
      referenceNo: 'NEFT/77821',
      lines: [],
      journalLines: [],
      allocations: [{ toVoucherId: sale2.id, amountMinor: 500000, type: 'AGAINST_REF' }],
      amountMinor: 500000,
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })
    await api.vouchers.post({
      requestId: 'guide-pay-1',
      type: 'PAYMENT',
      date: '2026-10-05',
      dueDate: null,
      partyId: supplier1.id,
      placeOfSupplyStateCode: null,
      narration: 'Part payment against PUR/0001',
      referenceNo: 'NEFT/55219',
      lines: [],
      journalLines: [],
      allocations: [{ toVoucherId: purchase1.id, amountMinor: 10000000, type: 'AGAINST_REF' }],
      amountMinor: 10000000,
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })
    await api.vouchers.post({
      requestId: 'guide-pay-2',
      type: 'PAYMENT',
      date: '2026-10-10',
      dueDate: null,
      partyId: supplier2.id,
      placeOfSupplyStateCode: null,
      narration: 'Part payment against PUR/0002',
      referenceNo: 'UPI/99310',
      lines: [],
      journalLines: [],
      allocations: [{ toVoucherId: purchase2.id, amountMinor: 1000000, type: 'AGAINST_REF' }],
      amountMinor: 1000000,
      cashAccountId: null,
      paymentMethodId: null,
      instrumentNo: null
    })

    const accounts = await api.accounts.list()
    const groups = await api.accounts.groups()
    const cash = accounts.find((account) => account.name === 'Cash')
    const bank = accounts.find((account) => account.name === 'Bank')
    const capitalGroup = groups.find((group) => group.name === 'Capital Account')
    const indirectGroup = groups.find((group) => group.name === 'Indirect Expenses')
    let capital = accounts.find((account) => account.name === 'Owner Capital')
    if (!capital && capitalGroup) {
      capital = await api.accounts.create({
        name: 'Owner Capital',
        groupId: capitalGroup.id,
        type: 'EQUITY',
        openingBalanceMinor: 0,
        openingBalanceSide: 'CREDIT'
      })
    }
    let office = accounts.find((account) => account.name === 'Office Expenses')
    if (!office && indirectGroup) {
      office = await api.accounts.create({
        name: 'Office Expenses',
        groupId: indirectGroup.id,
        type: 'EXPENSE',
        openingBalanceMinor: 0,
        openingBalanceSide: 'DEBIT'
      })
    }
    const expense = office ?? accounts.find((account) => account.type === 'EXPENSE') ?? undefined

    if (cash && capital) {
      await api.vouchers.post({
        requestId: 'guide-capital',
        type: 'JOURNAL',
        date: '2026-04-01',
        narration: 'Capital introduced by the owner',
        lines: [],
        journalLines: [
          { accountId: cash.id, debitMinor: 20000000, creditMinor: 0 },
          { accountId: capital.id, debitMinor: 0, creditMinor: 20000000 }
        ],
        allocations: []
      })
    }

    return {
      customerId: customer1.id,
      customer2Id: customer2.id,
      supplierId: supplier1.id,
      supplier2Id: supplier2.id,
      ssdId: ssd.id,
      hubId: hub.id,
      standId: stand.id,
      amcId: amc.id,
      purchase1: purchase1.id,
      purchase2: purchase2.id,
      sale1: sale1.id,
      sale2: sale2.id,
      expenseName: expense?.name ?? '',
      cashName: cash?.name ?? 'Cash',
      bankName: bank?.name ?? 'Bank'
    }
  })

  writeFileSync(join(shotsDir, '..', 'demo-data.json'), JSON.stringify(data, null, 2))
  console.log('  demo data ready', data)

  // Reload and remount the dashboard so its query cannot reuse the empty
  // first-run result that was cached during company creation.
  await page.reload()
  await page.getByText('Good ', { exact: false }).first().waitFor()
  await wait(900)
  await hideToasts()
  await goto('#/parties')
  await page.getByText('Sharma Electronics').first().waitFor()
  await goto('#/')
  const summary = await page.evaluate(() => window.api.dashboard.summary())
  console.log('  dashboard summary', summary)

  // ------------------------------------------------------------------ home
  await snap('01-dashboard', [
    {
      label: 1,
      text: 'Four numbers for today',
      locator: page.getByText('Receivables', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Quick actions',
      locator: page.getByRole('link', { name: 'New invoice' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'The modules live in this rail',
      locator: page.locator('aside nav'),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Current financial year and account',
      locator: page.getByText(/^FY /).first(),
      anchor: 'tl'
    }
  ])

  // --------------------------------------------------------------- parties
  await goto('#/parties')
  await page.getByText('Sharma Electronics').first().waitFor()
  await snap('02-parties', [
    {
      label: 1,
      text: 'Create a customer or supplier',
      locator: page.getByRole('button', { name: 'New party' }).first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Search by name, phone or GSTIN',
      locator: page.getByLabel('Search parties'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Filter by role',
      locator: page.getByRole('group', { name: 'Filter by role' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Current balance: positive means they owe you',
      locator: page.getByRole('cell', { name: /31,398.00/ }).first(),
      anchor: 'tl'
    }
  ])

  await page.getByRole('button', { name: 'New party' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByLabel('Name', { exact: true }).fill('Gupta Traders')
  await page.getByLabel('Phone', { exact: true }).fill('9820011122')
  await page.getByLabel('Email', { exact: true }).fill('accounts@guptatraders.in')
  await page.getByLabel('GSTIN', { exact: true }).fill('27AABCG7788H1Z3')
  await page.getByLabel('State code').fill('27')
  await page.getByLabel('Billing address').fill('12, MG Road, Pune 411001')
  await page.getByLabel('Credit days').fill('21')
  await page.getByLabel('Credit limit (INR)').fill('200000')
  await page.getByLabel('Supplier').click()
  await snapDialog('03-party-form', page.getByRole('dialog'), [
    {
      label: 1,
      text: 'Legal or trading name',
      locator: page.getByLabel('Name', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'GSTIN and state code control the tax type',
      locator: page.getByLabel('GSTIN', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Credit days set the default due date',
      locator: page.getByLabel('Credit days'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Customer, supplier, or both',
      locator: page.getByLabel('Customer'),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Opening balance is posted later, once',
      locator: page.getByLabel('Opening balance (INR)'),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Save the party',
      locator: page.getByRole('button', { name: 'Add party' }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await wait()

  // ----------------------------------------------------------------- items
  await goto('#/items')
  await page.getByText('SSD 256GB').first().waitFor()
  await snap('04-items', [
    {
      label: 1,
      text: 'Create a goods or service item',
      locator: page.getByRole('button', { name: 'New item' }).first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'HSN or SAC and GST rate',
      locator: page.getByRole('columnheader', { name: 'GST' }).first(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Quantity on hand, from posted movements',
      locator: page.getByRole('columnheader', { name: 'Stock' }).first(),
      anchor: 'tl'
    }
  ])

  await page.getByRole('button', { name: 'New item' }).first().click()
  await page.getByRole('dialog').waitFor()
  await page.getByLabel('Name', { exact: true }).fill('Wireless Keyboard')
  await page.getByLabel('SKU').fill('KBD-WL')
  await page.getByLabel(/HSN/).fill('8471')
  await page.locator('#item-unit').click()
  await page.getByRole('option', { name: /Nos/ }).click()
  await page.locator('#item-gst').click()
  await page.getByRole('option', { name: '18%' }).click()
  await page.getByLabel('Sale price (INR)').fill('1899')
  await page.getByLabel('Purchase price (INR)').fill('1250')
  await page.getByLabel('Opening qty').fill('12')
  await page.getByLabel('Opening rate (INR)').fill('1250')
  await page.getByLabel('Reorder level').fill('5')
  await snapDialog('05-item-form', page.getByRole('dialog'), [
    {
      label: 1,
      text: 'Name, SKU and HSN or SAC',
      locator: page.getByLabel('Name', { exact: true }),
      anchor: 'tl'
    },
    { label: 2, text: 'Unit and GST rate', locator: page.getByLabel('Unit'), anchor: 'tl' },
    {
      label: 3,
      text: 'Tick for services, which never hold stock',
      locator: page.getByLabel('Service item (no stock)'),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Default sale and purchase prices',
      locator: page.getByLabel('Sale price (INR)'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Opening stock and cost',
      locator: page.getByLabel('Opening qty'),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Save the item',
      locator: page.getByRole('button', { name: 'Add item' }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await wait()

  // --------------------------------------------------------------- company
  await goto('#/settings/company')
  await page.getByLabel('Registered name').first().waitFor()
  await snap('06-company', [
    {
      label: 1,
      text: 'Identity printed on invoices',
      locator: page.getByText('Identity', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Financial year and books begin date',
      locator: page.getByText('Financial year', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Stock costing and invoice rounding',
      locator: page.getByText('Stock and rounding', { exact: true }),
      anchor: 'tl'
    }
  ])

  const opening = page.getByText('Opening balances', { exact: true }).first()
  await opening.scrollIntoViewIfNeeded()
  await wait()
  await snap('07-opening-balances', [
    {
      label: 1,
      text: 'One opening voucher for parties, accounts and stock',
      locator: page.getByText(/Party, account and stock opening balances/),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Usually the first day of the books',
      locator: page.getByLabel('Opening date'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Runs once; corrections go through a journal',
      locator: page.getByRole('button', { name: 'Post opening balances' }),
      anchor: 'tl'
    }
  ])

  // ---------------------------------------------------------------- accounts
  await goto('#/masters/accounts')
  await page.getByText('Sales', { exact: true }).first().waitFor()
  await snap('08-accounts', [
    {
      label: 1,
      text: 'Add a ledger when the seeded list is not enough',
      locator: page.getByRole('button', { name: 'New account' }).first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Group decides the nature: asset, liability, income, expense',
      locator: page.getByLabel('Filter by account group'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Reserved accounts keep the posting engine working',
      locator: page.getByText('Reserved').first(),
      anchor: 'tl'
    }
  ])

  // --------------------------------------------------------------- purchase
  await goto('#/purchases/new')
  await page.getByLabel('Party').selectOption(String(data.supplierId))
  await page.getByLabel('Item for line 1').selectOption(String(data.ssdId))
  await page.getByLabel('Qty for line 1').fill('10')
  await page.getByLabel('Rate for line 1').fill('3000')
  await page.getByRole('button', { name: 'Add line' }).click()
  await page.getByLabel('Item for line 2').selectOption(String(data.hubId))
  await page.getByLabel('Qty for line 2').fill('5')
  await page.getByLabel('Rate for line 2').fill('1800')
  await page.getByLabel('Reference').fill('TC/26-27/604')
  await page.getByLabel('Narration').fill('Replenishment for October')
  await snap('09-purchase-entry', [
    { label: 1, text: 'Choose the supplier', locator: page.getByLabel('Party'), anchor: 'tl' },
    {
      label: 2,
      text: 'Bill date and due date',
      locator: page.getByLabel('Due date'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Add each item on its own line',
      locator: page.getByRole('button', { name: 'Add line' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Quantity, rate, discount and GST',
      locator: page.getByLabel('Qty for line 1'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Tax and total are calculated',
      locator: page.getByText('Taxable value', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Posts the bill and moves stock',
      locator: page.getByRole('button', { name: 'Post bill' }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wait()

  await goto(`#/vouchers/${data.purchase1}`)
  await page.getByText('PUR/0001').first().waitFor()
  await snap('10-purchase-detail', [
    {
      label: 1,
      text: 'Posted document with a permanent number',
      locator: page.getByText('PUR/0001').first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Print the bill or save it as PDF',
      locator: page.getByRole('button', { name: 'Print' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Cancel reverses the effect; the number is kept',
      locator: page.getByRole('button', { name: 'Cancel voucher' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Tax and total',
      locator: page.getByText('Taxable value', { exact: true }),
      anchor: 'tl'
    }
  ])

  // ---------------------------------------------------------------- payment
  await goto('#/payments/new')
  await page.getByLabel('Party').selectOption(String(data.supplierId))
  await page.getByLabel('Amount').fill('25000')
  await page.getByLabel('Method').selectOption({ label: 'NEFT' })
  await page.getByLabel('Reference').fill('NEFT/55220')
  await page.getByLabel('Notes').fill('Part payment for October stock')
  await page.getByLabel('Allocate to PUR/0001').fill('20000')
  await wait(400)
  await snap('11-payment-entry', [
    { label: 1, text: 'Supplier and amount paid', locator: page.getByLabel('Party'), anchor: 'tl' },
    {
      label: 2,
      text: 'Payment method and bank reference',
      locator: page.getByLabel('Method'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Open bills for that supplier',
      locator: page.getByText('Open bills', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Allocate against the bill being settled',
      locator: page.getByLabel('Allocate to PUR/0001'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Anything not allocated stays on account',
      locator: page.getByText('On account', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Post the payment',
      locator: page.getByRole('button', { name: /Post payment/i }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wait()

  await goto('#/reports/payables')
  await page.getByText('TechConnect Distributors').first().waitFor()
  await snap('12-payables', [
    {
      label: 1,
      text: 'As-of date: what was unpaid on that day',
      locator: page.getByLabel('As of'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Due date or bill date basis',
      locator: page.getByLabel('Basis'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Not yet due',
      locator: page.getByRole('columnheader', { name: 'Not due' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Past the due date',
      locator: page.getByRole('columnheader', { name: 'Overdue' }),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Supplier total',
      locator: page.getByRole('columnheader', { name: 'Total' }),
      anchor: 'tl'
    }
  ])

  // ------------------------------------------------------------------- sale
  await goto('#/sales/new')
  await page.getByLabel('Party').selectOption(String(data.customerId))
  await page.getByLabel('Item for line 1').selectOption(String(data.ssdId))
  await page.getByLabel('Qty for line 1').fill('3')
  await page.getByRole('button', { name: 'Add line' }).click()
  await page.getByLabel('Item for line 2').selectOption(String(data.hubId))
  await page.getByLabel('Qty for line 2').fill('1')
  await page.getByLabel('Reference').fill('PO-1088')
  await page.getByLabel('Narration').fill('Supply against purchase order 1088')
  await snap('13-sales-entry', [
    { label: 1, text: 'Choose the customer', locator: page.getByLabel('Party'), anchor: 'tl' },
    {
      label: 2,
      text: 'Invoice date and due date',
      locator: page.getByLabel('Due date'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Place of supply: customer state for inter-state',
      locator: page.getByLabel('Place of supply state code'),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Item lines with quantity and rate',
      locator: page.getByLabel('Qty for line 1'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'CGST + SGST, or IGST, calculated from the place of supply',
      locator: page.getByText(/Intra-state|Inter-state/).first(),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Post the invoice and assign INV/0003',
      locator: page.getByRole('button', { name: 'Post invoice' }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wait()

  await goto(`#/vouchers/${data.sale1}`)
  await page.getByText('INV/0001').first().waitFor()
  await snap('14-sales-detail', [
    {
      label: 1,
      text: 'Invoice number, date and due date',
      locator: page.getByText('INV/0001').first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Customer and GSTIN',
      locator: page.getByText('Sharma Electronics').first(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Print, or choose Save as PDF in the print dialog',
      locator: page.getByRole('button', { name: 'Print' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Line detail and tax split',
      locator: page.getByRole('columnheader', { name: 'Tax', exact: true }),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Amount due from the customer',
      locator: page.getByText('Total', { exact: true }).last(),
      anchor: 'tl'
    }
  ])

  await page.emulateMedia({ media: 'print' })
  await wait(450)
  const printRoot = page.locator('main .mx-auto').first()
  const printBox = await printRoot.boundingBox()
  if (printBox) {
    const clip = {
      x: Math.max(0, printBox.x - 12),
      y: Math.max(0, printBox.y - 18),
      width: printBox.width + 24,
      height: printBox.height + 30
    }
    await page.screenshot({ path: join(shotsDir, '15-invoice-print.png'), clip })
    const printMarks = [
      {
        label: 1,
        text: 'Invoice number and date',
        locator: page.getByText('INV/0001').first(),
        anchor: 'tl'
      },
      {
        label: 2,
        text: 'Customer and GSTIN',
        locator: page.getByText('Sharma Electronics').first(),
        anchor: 'tl'
      },
      {
        label: 3,
        text: 'Items, quantity, rate and tax',
        locator: page.getByRole('columnheader', { name: 'Tax', exact: true }),
        anchor: 'tl'
      },
      {
        label: 4,
        text: 'Tax split and total',
        locator: page.getByText('51,398.00', { exact: false }).last(),
        anchor: 'tl'
      }
    ]
    const placedPrint = []
    for (const mark of printMarks) {
      const box = await mark.locator.boundingBox().catch(() => null)
      if (!box) continue
      placedPrint.push({
        label: mark.label,
        text: mark.text,
        xPct: Number(
          Math.min(97, Math.max(2, ((box.x + 2 - clip.x) / clip.width) * 100)).toFixed(2)
        ),
        yPct: Number(
          Math.min(97, Math.max(2, ((box.y + 2 - clip.y) / clip.height) * 100)).toFixed(2)
        )
      })
    }
    annotations['15-invoice-print'] = placedPrint
    console.log(`  captured 15-invoice-print (${placedPrint.length} markers)`)
  }
  await page.emulateMedia({ media: 'screen' })
  await wait(300)

  // --------------------------------------------------------------- receipt
  await goto('#/receipts/new')
  await page.getByLabel('Party').selectOption(String(data.customerId))
  await page.getByLabel('Amount').fill('10000')
  await page.getByLabel('Method').selectOption({ label: 'UPI' })
  await page.getByLabel('Reference').fill('UPI/884121')
  await page.getByLabel('Notes').fill('Part payment for INV/0001')
  await page.getByLabel('Allocate to INV/0001').fill('10000')
  await wait(400)
  await snap('16-receipt-entry', [
    {
      label: 1,
      text: 'Customer and amount received',
      locator: page.getByLabel('Party'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Method and reference for the receipt',
      locator: page.getByLabel('Method'),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Open invoices',
      locator: page.getByText('Open invoices', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Allocate to the invoice being settled',
      locator: page.getByLabel('Allocate to INV/0001'),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Unallocated money stays as an advance',
      locator: page.getByText('On account', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 6,
      text: 'Post the receipt',
      locator: page.getByRole('button', { name: /Post receipt/i }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await wait()

  await goto('#/reports/receivables')
  await page.getByText('Sharma Electronics').first().waitFor()
  await snap('17-receivables', [
    {
      label: 1,
      text: 'Receivables as on today, or another date',
      locator: page.getByLabel('As of'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Not yet due',
      locator: page.getByRole('columnheader', { name: 'Not due' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Overdue amount',
      locator: page.getByRole('columnheader', { name: 'Overdue' }),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Total owed by each customer',
      locator: page.getByRole('columnheader', { name: 'Total' }),
      anchor: 'tl'
    }
  ])

  await goto('#/reports/ageing')
  await page.getByText('Sharma Electronics').first().waitFor()
  await snap('18-ageing', [
    {
      label: 1,
      text: 'Ageing by party',
      locator: page.getByRole('columnheader', { name: 'Party' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Buckets: 0-30, 31-60, 61-90, 91-180, 180+',
      locator: page.getByRole('columnheader', { name: '31-60' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Chase the oldest first',
      locator: page.getByRole('columnheader', { name: '180+' }),
      anchor: 'tl'
    }
  ])

  // ------------------------------------------------------------------ stock
  await goto('#/stock')
  await page.getByText('SSD 256GB').first().waitFor()
  await snap('19-stock', [
    {
      label: 1,
      text: 'Quantity after every posted purchase and sale',
      locator: page.getByRole('columnheader', { name: 'Quantity' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Value at weighted average cost',
      locator: page.getByRole('columnheader', { name: 'Value' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Total stock value',
      locator: page.getByText('Total stock value', { exact: true }),
      anchor: 'tl'
    }
  ])

  // -------------------------------------------------------------- registers
  await goto('#/reports/sales-register')
  await page.getByText('INV/0001').first().waitFor()
  await snap('20-sales-register', [
    { label: 1, text: 'From and To dates', locator: page.getByLabel('From'), anchor: 'tl' },
    {
      label: 2,
      text: 'Taxable value and GST for each invoice',
      locator: page.getByRole('columnheader', { name: 'GST' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Period totals',
      locator: page.getByText('Total', { exact: true }).last(),
      anchor: 'tl'
    }
  ])

  await goto('#/reports/purchase-register')
  await page.getByText('PUR/0001').first().waitFor()
  await snap('21-purchase-register', [
    {
      label: 1,
      text: 'Every purchase bill in the period',
      locator: page.getByRole('columnheader', { name: 'Number' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Input GST for the period',
      locator: page.getByRole('columnheader', { name: 'GST' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Totals to tie to the books',
      locator: page.getByText('Total', { exact: true }).last(),
      anchor: 'tl'
    }
  ])

  // ---------------------------------------------------------------- reports
  await goto('#/reports/trial-balance')
  await page.getByText('Debits equal credits.').waitFor()
  await snap('22-trial-balance', [
    {
      label: 1,
      text: 'Every account with a balance',
      locator: page.getByRole('columnheader', { name: 'Account' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Debit and credit columns',
      locator: page.getByRole('columnheader', { name: 'Debit' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'The proof: debits equal credits',
      locator: page.getByText('Debits equal credits.'),
      anchor: 'tl'
    }
  ])

  await goto('#/reports/profit-loss')
  await page.getByText('Net profit').waitFor()
  await snap('23-profit-loss', [
    {
      label: 1,
      text: 'From and To set the period',
      locator: page.getByLabel('From'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Income accounts',
      locator: page.getByText('Income', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Expense accounts',
      locator: page.getByText('Expense', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'Net profit for the period',
      locator: page.getByText('Net profit', { exact: true }),
      anchor: 'tl'
    }
  ])

  await goto('#/reports/balance-sheet')
  await page.getByText(/Assets equal liabilities/).waitFor()
  await snap('24-balance-sheet', [
    {
      label: 1,
      text: 'What the business owns',
      locator: page.getByText('Assets', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'What it owes',
      locator: page.getByText('Liabilities', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Owner stake plus current profit',
      locator: page.getByText('Equity', { exact: true }).first(),
      anchor: 'tl'
    },
    {
      label: 4,
      text: 'The check: assets equal liabilities plus equity',
      locator: page.getByText(/Assets equal liabilities/),
      anchor: 'tl'
    }
  ])

  await goto('#/day-book')
  await page.getByText('RCT/0001').first().waitFor()
  await snap('25-day-book', [
    {
      label: 1,
      text: 'Filter by date, status or text',
      locator: page.getByLabel('From'),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Click a number to open the voucher',
      locator: page.getByRole('link', { name: 'RCT/0001' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Party and total',
      locator: page.getByRole('columnheader', { name: 'Total' }),
      anchor: 'tl'
    }
  ])

  // --------------------------------------------------------------- journals
  await goto('#/journals')
  await page.getByRole('button', { name: 'New journal' }).click()
  await page.locator('div.fixed h2').filter({ hasText: 'New journal' }).waitFor()
  const journalSelects = page.locator('div.fixed select')
  await journalSelects.nth(0).selectOption({ label: data.expenseName })
  await journalSelects.nth(1).selectOption({ label: data.cashName })
  await page.locator('div.fixed input[placeholder="Debit"]').first().fill('2500')
  await page.locator('div.fixed input[placeholder="Credit"]').nth(1).fill('2500')
  await page.locator('div.fixed input').last().fill('Office expenses paid in cash')
  await snapDialog('26-journal-dialog', page.locator('div.fixed > div').first(), [
    {
      label: 1,
      text: 'Date of the adjustment',
      locator: page.locator('div.fixed input[type="date"]'),
      anchor: 'tl'
    },
    { label: 2, text: 'Debit the expense', locator: journalSelects.nth(0), anchor: 'tl' },
    { label: 3, text: 'Credit cash or bank', locator: journalSelects.nth(1), anchor: 'tl' },
    {
      label: 4,
      text: 'Debits must equal credits',
      locator: page.getByText('Balanced', { exact: true }),
      anchor: 'tl'
    },
    {
      label: 5,
      text: 'Post the journal',
      locator: page.getByRole('button', { name: 'Post', exact: true }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await wait(700)

  await page.getByRole('button', { name: 'New contra' }).click()
  await page.locator('div.fixed h2').filter({ hasText: 'New contra' }).waitFor()
  const contraSelects = page.locator('div.fixed select')
  await contraSelects.nth(0).selectOption({ label: data.cashName })
  await contraSelects.nth(1).selectOption({ label: data.bankName })
  await page.locator('div.fixed input[type="date"]').fill('2026-10-18')
  await page.getByLabel('Amount').fill('5000')
  await page.locator('div.fixed input').last().fill('Cash deposited into the bank')
  await snapDialog('27-contra-dialog', page.locator('div.fixed > div').first(), [
    { label: 1, text: 'From account, usually Cash', locator: contraSelects.nth(0), anchor: 'tl' },
    { label: 2, text: 'To account, usually Bank', locator: contraSelects.nth(1), anchor: 'tl' },
    { label: 3, text: 'Amount moved', locator: page.getByLabel('Amount'), anchor: 'tl' },
    {
      label: 4,
      text: 'Post the transfer',
      locator: page.getByRole('button', { name: 'Post', exact: true }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await wait(700)

  await snap('28-journals', [
    {
      label: 1,
      text: 'Manual journal for adjustments',
      locator: page.getByRole('button', { name: 'New journal' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Contra for cash to bank',
      locator: page.getByRole('button', { name: 'New contra' }),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Posted journals and transfers',
      locator: page.getByRole('columnheader', { name: 'Type' }),
      anchor: 'tl'
    }
  ])

  // ---------------------------------------------------------- cancel dialog
  await goto(`#/vouchers/${data.sale2}`)
  await page.getByRole('button', { name: 'Cancel voucher' }).click()
  await page.getByLabel('Reason').fill('Customer cancelled the order')
  await snapDialog('29-cancel-dialog', page.getByRole('dialog'), [
    { label: 1, text: 'A reason is required', locator: page.getByLabel('Reason'), anchor: 'tl' },
    {
      label: 2,
      text: 'The voucher stays, marked cancelled',
      locator: page.getByRole('button', { name: 'Cancel voucher' }).last(),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Back out without changing anything',
      locator: page.getByRole('button', { name: 'Keep voucher' }),
      anchor: 'tl'
    }
  ])
  await page.getByRole('button', { name: 'Keep voucher' }).click()
  await wait()

  // ------------------------------------------------------------------ backup
  await goto('#/settings/backup')
  await page.getByRole('button', { name: 'Create backup' }).click()
  await page
    .getByText(/crown-books-.*\.db/)
    .first()
    .waitFor()
  await snap('30-backup', [
    {
      label: 1,
      text: 'Create a copy now',
      locator: page.getByRole('button', { name: 'Create backup' }),
      anchor: 'tl'
    },
    {
      label: 2,
      text: 'Restore is done outside the app, with it closed',
      locator: page.getByText(/Restoring is manual/),
      anchor: 'tl'
    },
    {
      label: 3,
      text: 'Every backup with its timestamp and size',
      locator: page.getByRole('columnheader', { name: 'File' }),
      anchor: 'tl'
    }
  ])

  writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2))
  console.log(`\nSaved ${Object.keys(annotations).length} screens to ${shotsDir}`)
  console.log(`Annotations: ${annotationsPath}`)
} finally {
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
}
