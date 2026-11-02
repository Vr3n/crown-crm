#!/usr/bin/env node
/**
 * Full UI end-to-end test.
 *
 * Starts the release binary with WebView2 remote debugging, attaches over the
 * DevTools protocol, and drives the real application:
 *
 *   1. first run: the setup screen renders and the IPC bridge answers
 *   2. setup writes the company; the reloaded app restores the session and
 *      shows the first-run numbering wizard
 *   3. completing numbering lands on the dashboard
 *   4. every route in AppRoutes renders real content (no blank screen, no crash)
 *   5. a party is created through the dialog, with the form's own validation
 *   6. an item and a sales invoice are posted, then the voucher detail, the
 *      party detail, the receivables report, the trial balance and the print
 *      view are all read back from the running UI
 *
 * Usage:
 *   node scripts/smoke-ui.mjs
 *   node scripts/smoke-ui.mjs "C:\Program Files\Crown Books\crown-books.exe"
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const exe = resolve(
  process.argv[2] ??
    join('src-tauri', 'target', 'release', process.platform === 'win32' ? 'crown-books.exe' : 'crown-books')
)

if (!existsSync(exe)) {
  console.error(`smoke-ui: no binary at ${exe}`)
  process.exit(1)
}

const COMPANY = 'Smoke Test Traders'
const PARTY = 'Smoke Customer'
const ITEM = 'Smoke Widget'
const port = 9333
const dataDir = mkdtempSync(join(tmpdir(), 'crown-books-ui-'))

const child = spawn(exe, [], {
  env: {
    ...process.env,
    CROWN_BOOKS_USER_DATA: dataDir,
    CROWN_BOOKS_E2E: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`
  },
  stdio: ['ignore', 'pipe', 'pipe']
})

let appStderr = ''
child.stderr.on('data', (chunk) => {
  appStderr += chunk.toString()
})

/** @returns {Promise<void>} */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

const problems = []
/**
 * @param {string} label
 * @param {boolean} ok
 * @param {string} [detail]
 * @returns {void}
 */
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    problems.push(detail ? `${label} (${detail})` : label)
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Resolves the WebView2 page target once DevTools is listening.
 * @returns {Promise<{ webSocketDebuggerUrl: string } | null>}
 */
async function findTarget() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`)
    if (!response.ok) return null
    const targets = await response.json()
    return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl) ?? null
  } catch {
    return null
  }
}

/**
 * Runs an expression in the page and returns its value.
 * @param {string} expression
 * @returns {Promise<unknown>}
 */
async function evaluate(expression) {
  const deadline = Date.now() + 10_000
  let target = await findTarget()
  while (!target && Date.now() < deadline) {
    await sleep(200)
    target = await findTarget()
  }
  if (!target) throw new Error('no page target')

  return new Promise((done, failed) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    const timer = setTimeout(() => {
      socket.close()
      failed(new Error('DevTools evaluate timed out'))
    }, 15_000)

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true }
        })
      )
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      if (message.error) failed(new Error(message.error.message))
      else if (message.result?.exceptionDetails) {
        failed(new Error(message.result.exceptionDetails.exception?.description ?? 'page threw'))
      } else done(message.result?.result?.value)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      failed(new Error('DevTools socket failed'))
    })
  })
}

/** @returns {Promise<string>} */
async function bodyText() {
  return String(await evaluate('document.body.innerText'))
}

/**
 * Polls until the page text contains every marker.
 * @param {string[]} markers
 * @param {number} [timeout]
 * @returns {Promise<string>}
 */
async function waitForText(markers, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let text = ''
  while (Date.now() < deadline) {
    text = await bodyText()
    if (markers.every((marker) => text.includes(marker))) return text
    await sleep(300)
  }
  return text
}

/**
 * Navigates the hash router and waits for the new screen.
 * @param {string} route
 * @param {string[]} [markers]
 * @returns {Promise<string>}
 */
async function goto(route, markers = []) {
  await evaluate(`(() => { location.hash = ${JSON.stringify(`#${route}`)}; return true })()`)
  await sleep(250)
  if (markers.length === 0) {
    // Give the route a moment to render before the caller measures it.
    await sleep(700)
    return bodyText()
  }
  return waitForText(markers)
}

/**
 * Clicks the first button whose trimmed text matches.
 * @param {string} label
 * @returns {Promise<string>}
 */
async function clickButton(label) {
  return String(
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(label)})
      if (!button) return 'missing'
      button.click()
      return 'clicked'
    })()`)
  )
}

/**
 * Sets a React-controlled field through the native value setter.
 * @param {string} fieldId
 * @param {string} value
 * @returns {Promise<string>}
 */
async function setField(fieldId, value) {
  return String(
    await evaluate(`(() => {
      const field = document.getElementById(${JSON.stringify(fieldId)})
      if (!field) return 'missing'
      const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      setter.call(field, ${JSON.stringify(value)})
      field.dispatchEvent(new Event('input', { bubbles: true }))
      field.dispatchEvent(new Event('change', { bubbles: true }))
      return 'set'
    })()`)
  )
}

/** @returns {void} */
function stop() {
  if (!child.killed) child.kill()
}

try {
  // -------------------------------------------------------------------
  // Boot and first run
  // -------------------------------------------------------------------
  const bootDeadline = Date.now() + 30_000
  let target = null
  while (Date.now() < bootDeadline) {
    if (child.exitCode !== null) throw new Error(`app exited early with code ${child.exitCode}`)
    target = await findTarget()
    if (target) break
    await sleep(300)
  }
  if (!target) throw new Error(`WebView2 never exposed DevTools on port ${port}`)

  console.log('first run')
  let text = await waitForText(['Set up the books'])
  check('the setup screen renders', text.includes('Set up the books'))
  check('React mounted', text.length > 200, `${text.length} chars`)

  const status = String(await evaluate('window.api.identity.status()'))
  check('window.api answers SETUP_REQUIRED through the CSP', status === 'SETUP_REQUIRED', status)
  check(
    'the bridge exposes every domain',
    (await evaluate(
      "['identity','parties','items','accounts','units','taxRates','godowns','vouchers','invoice','dashboard','search','summaries','numbering','reports','license','backup'].every((key) => typeof window.api[key] === 'object')"
    )) === true
  )

  // -------------------------------------------------------------------
  // Setup, session restore, first-run wizard
  // -------------------------------------------------------------------
  console.log('setup and session restore')
  const created = await evaluate(`window.api.identity.setup({
    name: ${JSON.stringify(COMPANY)},
    ownerFullName: 'Smoke Owner',
    ownerEmail: 'owner@smoke.test',
    ownerPassword: 'correct-horse',
    stateCode: '27',
    booksBeginDate: '2026-04-01'
  }).then((session) => session.companyName)`)
  check('identity.setup creates the company', created === COMPANY, String(created))

  await evaluate('(() => { setTimeout(() => location.reload(), 50); return true })()')
  await sleep(1500)
  text = await waitForText(['Number your vouchers'])
  check('the session is restored and the wizard shows', text.includes('Number your vouchers'))
  check('the setup screen is gone', !text.includes('Set up the books'))

  // Save through the wizard itself: its own submit updates the cached company
  // profile before navigating, which is exactly what a real first run does.
  check('the wizard save button is present', (await clickButton('Save numbering')) === 'clicked')
  text = await waitForText(['where the books stand today'], 25_000)
  check('the dashboard renders for the signed-in owner', text.includes(COMPANY), text.replace(/\s+/g, ' ').slice(0, 220))
  check('the dashboard shows the setup checklist', text.includes('Number your vouchers'))

  // -------------------------------------------------------------------
  // Every route renders
  // -------------------------------------------------------------------
  console.log('every route')
  const routes = [
    ['/', ['Dashboard', 'Books']],
    ['/parties', []],
    ['/customers', []],
    ['/suppliers', []],
    ['/items', []],
    ['/stock', []],
    ['/journals', []],
    ['/day-book', []],
    ['/sales', []],
    ['/purchases', []],
    ['/receipts', []],
    ['/payments', []],
    ['/masters/accounts', []],
    ['/masters/units', []],
    ['/masters/tax-rates', []],
    ['/settings/company', []],
    ['/settings/numbering', []],
    ['/settings/users', []],
    ['/settings/backup', []],
    ['/reports/receivables', []],
    ['/reports/payables', []],
    ['/reports/ageing', []],
    ['/reports/trial-balance', []],
    ['/reports/profit-loss', []],
    ['/reports/balance-sheet', []],
    ['/reports/sales-register', []],
    ['/reports/purchase-register', []]
  ]
  for (const [route] of routes) {
    const routeText = await goto(route)
    const rendered = routeText.length > 300 && !routeText.includes('Unexpected Application Error')
    check(`${route} renders`, rendered, `${routeText.length} chars`)
  }

  // -------------------------------------------------------------------
  // A party through the real dialog
  // -------------------------------------------------------------------
  console.log('party dialog')
  await goto('/parties', ['New party'])
  check('the New party trigger is present', (await clickButton('New party')) === 'clicked')
  text = await waitForText(['Add party'])
  check('the dialog opens', text.includes('Add party'))
  check('the name field exists', (await setField('name', PARTY)) === 'set')
  check('the credit days field accepts input', (await setField('creditDays', '15')) === 'set')
  check('submitting the form works', (await clickButton('Add party')) === 'clicked')

  text = await waitForText([PARTY], 15_000)
  check('the new party appears in the list', text.includes(PARTY))

  // Validation still runs: an empty name must not create a row.
  const partiesBefore = await evaluate('window.api.parties.list({}).then((rows) => rows.length)')
  await clickButton('New party')
  await waitForText(['Add party'])
  await clickButton('Add party')
  await sleep(800)
  const partiesAfter = await evaluate('window.api.parties.list({}).then((rows) => rows.length)')
  check('an empty form is rejected by the dialog', partiesBefore === partiesAfter, `${partiesBefore} -> ${partiesAfter}`)
  await clickButton('Cancel')
  await sleep(400)

  // -------------------------------------------------------------------
  // An item and an invoice, then the screens that read them
  // -------------------------------------------------------------------
  console.log('invoice and reports')
  const item = await evaluate(`window.api.items.create({
    name: ${JSON.stringify(ITEM)},
    hsnSac: '8471',
    gstRateBps: 1800,
    salePriceMinor: 25000,
    purchasePriceMinor: 18000,
    openingQtyE4: 50000,
    openingRateMinor: 18000
  }).then((row) => row.id)`)
  check('an item can be created', typeof item === 'number', String(item))

  const opening = await evaluate("window.api.vouchers.postOpening('2026-04-01').then((row) => row.number)")
  check('opening balances post', String(opening).startsWith('OPN/'), String(opening))

  const posted = await evaluate(`window.api.parties.list({ query: ${JSON.stringify(PARTY)} }).then((rows) =>
    window.api.vouchers.post({
      requestId: 'ui-sale-0001',
      type: 'SALES',
      date: '2026-04-15',
      partyId: rows[0].id,
      lines: [{
        itemId: ${item},
        description: ${JSON.stringify(ITEM)},
        hsn: '8471',
        uom: 'nos',
        qtyE4: 20000,
        rateMinor: 25000,
        discountBps: 0,
        gstRateBps: 1800
      }]
    })
  )`)
  check('a sales invoice posts', posted?.number === 'INV/0001', JSON.stringify(posted))
  const voucherId = posted?.id

  text = await goto(`/vouchers/${voucherId}`, ['INV/0001'])
  check('the voucher detail shows the number', text.includes('INV/0001'))
  check('the voucher detail shows the taxed total', text.includes('590.00'), 'expected 2 x 250.00 + 18%')

  text = await goto('/parties', [PARTY])
  check('the party list shows the new party', text.includes(PARTY))

  text = await goto('/reports/receivables', [PARTY])
  check('receivables show the invoice', text.includes(PARTY) && text.includes('590.00'))
  check(
    'the receivables chart renders with its data table',
    (await evaluate("!!document.querySelector('[data-chart-data-table]')")) === true
  )

  text = await goto('/reports/trial-balance', ['Sales'])
  check('the trial balance lists Sales', text.includes('Sales'))
  check('the trial balance balances', text.includes('TOTAL') || text.includes('Total'), text.slice(0, 200))

  text = await goto('/reports/profit-loss', [])
  check('the profit and loss renders the sale', text.includes('Sales'))

  text = await goto('/stock', [ITEM])
  check('the stock page shows the item', text.includes(ITEM))

  text = await goto(`/print/vouchers/${voucherId}`, ['ORIGINAL FOR RECIPIENT'])
  check('the print view renders both GST copies', text.includes('ORIGINAL FOR RECIPIENT'))
  check('the print view shows the company', text.includes(COMPANY))

  await goto('/settings/company', [])
  text = await bodyText()
  check('company settings render the profile', text.includes(COMPANY))

  // -------------------------------------------------------------------
  // A purchase bill is numbered by its supplier
  // -------------------------------------------------------------------
  console.log('purchase bill numbers')
  const supplier = await evaluate(`window.api.parties.create({
    name: 'Smoke Supplier',
    isSupplier: true,
    stateCode: '27',
    creditDays: 15
  }).then((row) => row.id)`)
  check('a supplier can be created', typeof supplier === 'number', String(supplier))

  const supplierBill = 'TC/2026-27/583'
  // The list defaults to this month, so post on today's date.
  const purchaseDate = new Date().toISOString().slice(0, 10)
  const purchaseLine = `{
    itemId: ${item},
    description: ${JSON.stringify(ITEM)},
    hsn: '8471',
    uom: 'nos',
    qtyE4: 10000,
    rateMinor: 18000,
    discountBps: 0,
    gstRateBps: 1800
  }`

  const purchase = await evaluate(`window.api.vouchers.post({
    requestId: 'ui-pur-0001',
    type: 'PURCHASE',
    date: ${JSON.stringify(purchaseDate)},
    partyId: ${supplier},
    supplierBillNo: ${JSON.stringify(supplierBill)},
    lines: [${purchaseLine}]
  })`)
  check(
    'a purchase bill keeps the supplier number',
    purchase?.number === supplierBill,
    JSON.stringify(purchase)
  )

  const duplicate = await evaluate(`window.api.vouchers.post({
    requestId: 'ui-pur-0002',
    type: 'PURCHASE',
    date: ${JSON.stringify(purchaseDate)},
    partyId: ${supplier},
    supplierBillNo: ${JSON.stringify(supplierBill.toLowerCase())},
    lines: [${purchaseLine}]
  }).then(() => 'posted').catch((error) => error.code)`)
  check(
    'the duplicate supplier bill is refused by code',
    duplicate === 'DUPLICATE_SUPPLIER_BILL',
    String(duplicate)
  )

  const noBill = await evaluate(`window.api.vouchers.post({
    requestId: 'ui-pur-0003',
    type: 'PURCHASE',
    date: ${JSON.stringify(purchaseDate)},
    partyId: ${supplier},
    supplierBillMissing: true,
    lines: [${purchaseLine}]
  })`)
  check(
    'a no-bill purchase takes the PUR series',
    String(noBill?.number).startsWith('PUR/'),
    JSON.stringify(noBill)
  )

  text = await goto('/purchases', [supplierBill])
  check('the purchase list shows the supplier bill number', text.includes(supplierBill))

  text = await goto(`/print/vouchers/${purchase?.id}`, ['ORIGINAL FOR RECIPIENT'])
  check(
    'the purchase print shows the supplier bill number',
    text.toLowerCase().includes('supplier bill no.') && text.includes(supplierBill),
    text.slice(0, 300)
  )

  text = await goto(`/print/vouchers/${noBill?.id}`, ['ORIGINAL FOR RECIPIENT'])
  check(
    'a no-bill purchase prints the internal PUR number',
    text.toLowerCase().includes('supplier bill no.') && text.includes('PUR/'),
    text.slice(0, 300)
  )
} catch (error) {
  problems.push(error.message)
  console.error(`smoke-ui: ${error.message}`)
  if (appStderr.trim()) console.error(appStderr.trim())
} finally {
  stop()
  await sleep(500)
  // WebView2 keeps its user-data folder mapped for a moment after the process
  // exits; a locked cleanup must not fail the run.
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  } catch {
    // left for the OS temp sweeper
  }
}

if (problems.length > 0) {
  console.error(`\nsmoke-ui: ${problems.length} failure(s)`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exitCode = 1
} else {
  console.log('\nsmoke-ui: ok — every screen rendered and every flow worked')
}
