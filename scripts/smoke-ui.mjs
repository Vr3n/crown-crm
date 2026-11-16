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
 *   7. a supplier and an item are created from the bill's own pickers, then the
 *      bill posts with both and opens its detail
 *   8. a customer is created from a receipt's party picker
 *
 * Usage:
 *   node scripts/smoke-ui.mjs
 *   node scripts/smoke-ui.mjs "C:\Program Files\Crown Books\crown-books.exe"
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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
const SAMPLE = resolve('docs/guides/sample-bills-from-pdfs.xlsx')
const port = 9333
const dataDir = mkdtempSync(join(tmpdir(), 'crown-books-ui-'))

const child = spawn(exe, [], {
  env: {
    ...process.env,
    CROWN_BOOKS_USER_DATA: dataDir,
    CROWN_BOOKS_E2E: '1',
    // Keep the test webview out of the folder a running dev app uses, so both
    // can run at once.
    WEBVIEW2_USER_DATA_FOLDER: join(dataDir, 'webview2'),
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
    const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    return pages.find((target) => !String(target.url).startsWith('about:')) ?? pages[0] ?? null
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
  return String(await evaluate('document.body ? document.body.innerText : ""'))
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

/**
 * Clicks the first element matching a CSS selector.
 * @param {string} selector
 * @returns {Promise<string>}
 */
async function clickSelector(selector) {
  return String(
    await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) return 'missing'
      element.click()
      return 'clicked'
    })()`)
  )
}

/**
 * Sets a file input from a local file. The bytes travel inside the evaluated
 * expression, so WebView2 needs no file-system permission.
 * @param {string} selector
 * @param {string} filePath
 * @param {string} fileName
 * @returns {Promise<string>}
 */
async function uploadFile(selector, filePath, fileName) {
  const base64 = readFileSync(filePath).toString('base64')
  return String(
    await evaluate(`(async () => {
      const input = document.querySelector(${JSON.stringify(selector)})
      if (!input) return 'missing'
      const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (char) => char.charCodeAt(0))
      const file = new File([bytes], ${JSON.stringify(fileName)}, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return 'uploaded'
    })()`)
  )
}

/**
 * Polls an expression until it is truthy.
 * @param {string} expression
 * @param {number} [timeout]
 * @returns {Promise<boolean>}
 */
async function waitFor(expression, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await evaluate(expression)) === true) return true
    await sleep(250)
  }
  return false
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
  // Setup form: copy and per-field validation feedback
  // -------------------------------------------------------------------
  console.log('setup form feedback')
  const ownerField = await evaluate(`(() => {
    const input = document.getElementById('ownerName')
    const label = document.querySelector('label[for="ownerName"]')
    return { placeholder: input?.placeholder ?? null, label: label?.textContent ?? null }
  })()`)
  check(
    'the owner label reads Owner Full Name',
    String(ownerField.label).includes('Owner Full Name'),
    String(ownerField.label)
  )
  check(
    'the owner placeholder is John Ant Doe',
    ownerField.placeholder === 'John Ant Doe',
    String(ownerField.placeholder)
  )

  check('the setup form submits empty', (await clickButton('Create company and sign in')) === 'clicked')
  text = await waitForText(['Company name is required', 'Owner full name is required'])
  check(
    'every invalid field explains itself',
    [
      'Company name is required',
      'Owner full name is required',
      'Owner email is required',
      'Create a password'
    ].every((message) => text.includes(message)),
    text.replace(/\s+/g, ' ').slice(0, 260)
  )
  const invalidSetup = await evaluate(`(() => {
    const ids = ['companyName', 'ownerName', 'ownerEmail', 'password']
    return ids.map((id) => ({ id, invalid: document.getElementById(id)?.getAttribute('aria-invalid') ?? null }))
  })()`)
  check(
    'every invalid input is marked invalid',
    invalidSetup.every((field) => field.invalid === 'true'),
    JSON.stringify(invalidSetup)
  )
  check(
    'the first invalid field takes focus',
    (await evaluate('document.activeElement?.id')) === 'companyName'
  )

  check(
    'a valid value is typed into the business name',
    (await setField('companyName', COMPANY)) === 'set'
  )
  check(
    'the corrected field turns green',
    await waitFor("document.getElementById('companyName')?.dataset.valid === 'true'")
  )
  const borders = await evaluate(`(() => {
    const read = (id) => {
      const live = document.getElementById(id)
      const plain = live.cloneNode(false)
      plain.removeAttribute('id')
      plain.removeAttribute('data-valid')
      plain.removeAttribute('aria-invalid')
      document.body.appendChild(plain)
      const untouched = getComputedStyle(plain).borderTopColor
      plain.remove()
      return { live: getComputedStyle(live).borderTopColor, untouched }
    }
    return { valid: read('companyName'), invalid: read('ownerEmail') }
  })()`)
  check(
    'the valid input is bordered differently from an untouched one',
    borders.valid.live !== borders.valid.untouched,
    JSON.stringify(borders.valid)
  )
  check(
    'the invalid input is bordered differently from an untouched one',
    borders.invalid.live !== borders.invalid.untouched,
    JSON.stringify(borders.invalid)
  )
  check(
    'valid and invalid borders differ from each other',
    borders.valid.live !== borders.invalid.live,
    JSON.stringify(borders)
  )
  check(
    'the corrected field clears its error',
    (await evaluate("document.body.innerText.includes('Company name is required')")) === false
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
  const numberingWidth = await evaluate(`(() => {
    const table = document.querySelector('main table')
    return {
      page: window.innerWidth,
      table: Math.round(table?.getBoundingClientRect().width ?? 0)
    }
  })()`)
  check(
    'the numbering page uses the full window width',
    numberingWidth.table >= numberingWidth.page * 0.9,
    JSON.stringify(numberingWidth)
  )

  check('the wizard save button is present', (await clickButton('Save numbering')) === 'clicked')
  text = await waitForText(['where the books stand today'], 25_000)
  check('the dashboard renders for the signed-in owner', text.includes(COMPANY), text.replace(/\s+/g, ' ').slice(0, 220))
  check('the dashboard shows the setup checklist', text.includes('Number your vouchers'))

  // -------------------------------------------------------------------
  // Item dialog layout: wide, no scroll, tinted price panels on one row
  // -------------------------------------------------------------------
  console.log('item dialog layout')
  await goto('/items?action=new', ['New item'])
  const itemLayout = await evaluate(`(() => {
    const hue = (value) => {
      const oklch = value.match(/oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)/)
      if (oklch) return Number(oklch[3])
      const rgb = value.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)/)
      if (!rgb) return null
      const channels = rgb.slice(1).map(Number).map((channel) => channel / 255)
      const max = Math.max(...channels)
      const min = Math.min(...channels)
      const delta = max - min
      if (delta === 0) return 0
      const [r, g, b] = channels
      let angle
      if (max === r) angle = ((g - b) / delta) % 6
      else if (max === g) angle = (b - r) / delta + 2
      else angle = (r - g) / delta + 4
      angle *= 60
      return angle < 0 ? angle + 360 : angle
    }
    const dialog = document.querySelector('[data-slot="dialog-content"]')
    const purchase = document.querySelector('[data-price-panel="purchase"]')
    const sale = document.querySelector('[data-price-panel="sale"]')
    if (!dialog || !purchase || !sale) return null
    const purchaseRect = purchase.getBoundingClientRect()
    const saleRect = sale.getBoundingClientRect()
    return {
      width: Math.round(dialog.getBoundingClientRect().width),
      scroll: Math.round(dialog.scrollHeight - dialog.clientHeight),
      sameRow: Math.abs(purchaseRect.top - saleRect.top) < 2,
      gap: Math.round(saleRect.left - purchaseRect.right),
      purchaseHue: hue(getComputedStyle(purchase.querySelector('label')).color),
      saleHue: hue(getComputedStyle(sale.querySelector('label')).color),
      purchaseBg: getComputedStyle(purchase).backgroundColor,
      saleBg: getComputedStyle(sale).backgroundColor
    }
  })()`)
  if (!itemLayout) throw new Error('the item dialog did not render its price panels')
  check('the item dialog is wide', itemLayout.width >= 900, JSON.stringify(itemLayout))
  check('the item dialog does not scroll', itemLayout.scroll <= 0, JSON.stringify(itemLayout))
  check(
    'purchase and sale prices share a row',
    itemLayout.sameRow === true,
    JSON.stringify(itemLayout)
  )
  check('the price panels are separated by a gap', itemLayout.gap >= 8, JSON.stringify(itemLayout))
  check(
    'the two price panels are tinted differently',
    itemLayout.purchaseBg !== itemLayout.saleBg,
    JSON.stringify(itemLayout)
  )
  check(
    'purchase reads blue and sale reads violet',
    itemLayout.purchaseHue > 200 &&
      itemLayout.purchaseHue < 270 &&
      itemLayout.saleHue > 270 &&
      itemLayout.saleHue < 330,
    JSON.stringify(itemLayout)
  )
  check('the item dialog closes', (await clickButton('Cancel')) === 'clicked')

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
  // Excel importer: the PDF sample, the real backend, the real logs
  // -------------------------------------------------------------------
  console.log('excel importer')
  await goto('/import/excel', ['Import from Excel'])
  check('the importer route renders', (await bodyText()).includes('Import from Excel'))
  check('the sample file exists', existsSync(SAMPLE), SAMPLE)
  check(
    'the sample uploads',
    (await uploadFile('input[type=file]', SAMPLE, 'sample-bills-from-pdfs.xlsx')) === 'uploaded'
  )
  text = await waitForText(['Sheet and range', '9 data rows'], 20_000)
  check('the purchase sheet range is selected', text.includes('9 data rows'))
  await waitFor(
    "(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Map columns'); return Boolean(b) && !b.disabled })()"
  )
  check('the range step can continue', (await clickButton('Map columns')) === 'clicked')
  text = await waitForText(['Match your columns'], 15_000)
  check('the mapping step opens', text.includes('Match your columns'))
  check('the item creation option is present', (await clickSelector('#create-items')) === 'clicked')
  await waitFor(
    "(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Check rows'); return Boolean(b) && !b.disabled })()"
  )
  check('the mapping step can continue', (await clickButton('Check rows')) === 'clicked')
  text = await waitForText(['Purchase bills to create', 'Import 1 purchase bill'], 20_000)
  check('the review shows the PDF total', text.includes('15,545.00'))
  check('the review names the supplier', text.includes('TECHCONNECT INFORMATIQUE'))
  check('the import starts', (await clickButton('Import 1 purchase bill')) === 'clicked')
  text = await waitForText(['1 purchase bill posted'], 30_000)
  check('the import finishes', text.includes('1 purchase bill posted'))

  const purchases = await evaluate(
    "window.api.vouchers.list({ type: 'PURCHASE', limit: 10 }).then((rows) => rows.map((row) => ({ party: row.partyName, total: row.totalMinor, number: row.number })))"
  )
  check(
    'the posted purchase is in the database',
    Array.isArray(purchases) &&
      purchases.some(
        (row) => row.party === 'TECHCONNECT INFORMATIQUE' && row.total === 1_554_500
      ),
    JSON.stringify(purchases)
  )

  await sleep(800)
  const logDir = join(dataDir, 'logs')
  const logText = existsSync(logDir)
    ? readdirSync(logDir)
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => readFileSync(join(logDir, name), 'utf8'))
        .join('\n')
    : ''
  check(
    'the run wrote structured logs',
    logText.includes('"source":"renderer"') &&
      logText.includes('"module":"import"') &&
      logText.includes('"event":"run.finish"') &&
      logText.includes('"event":"post.ok"'),
    logText.length ? `${logText.length} chars` : 'no log files'
  )

  // -------------------------------------------------------------------
  // A party through the real dialog
  // -------------------------------------------------------------------
  console.log('party dialog')
  await goto('/parties', ['New party'])
  check('the New party trigger is present', (await clickButton('New party')) === 'clicked')
  text = await waitForText(['Add party'])
  check('the dialog opens', text.includes('Add party'))
  const partyLayout = await evaluate(`(() => {
    const dialog = document.querySelector('[data-slot="dialog-content"]')
    const grid = dialog?.querySelector('form > div.grid')
    return dialog ? {
      width: Math.round(parseFloat(getComputedStyle(dialog).width)),
      scroll: Math.round(dialog.scrollHeight - dialog.clientHeight),
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0
    } : null
  })()`)
  if (!partyLayout) throw new Error('the party dialog did not render')
  check('the party dialog is wide', partyLayout.width >= 850, JSON.stringify(partyLayout))
  check('the party dialog does not scroll', partyLayout.scroll <= 0, JSON.stringify(partyLayout))
  check('the party dialog uses three columns', partyLayout.columns === 3, JSON.stringify(partyLayout))
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

  // -------------------------------------------------------------------
  // A supplier and an item created from the bill's own pickers
  // -------------------------------------------------------------------
  console.log('create from the bill pickers')
  const INLINE_SUPPLIER = 'Inline Supplier'
  const INLINE_ITEM = 'Inline Widget'
  const INLINE_BILL = 'INLINE/0001'

  await goto('/purchases/new', ['Post bill'])
  check(
    'the bill header offers the supplier picker',
    (await clickSelector('[role="combobox"][aria-label="Select supplier"]')) === 'clicked'
  )
  check(
    'the supplier picker offers a create action',
    await waitFor(
      "[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'New supplier')"
    )
  )
  check('the create action opens the party dialog', (await clickButton('New supplier')) === 'clicked')
  text = await waitForText(['New party', 'Add party'])
  check('the party dialog opens over the bill', text.includes('Add party'))
  check('the supplier name field is ready', await waitFor(`document.getElementById('name') !== null`))

  check('the new supplier name is typed', (await setField('name', INLINE_SUPPLIER)) === 'set')
  check('the party dialog saves', (await clickButton('Add party')) === 'clicked')
  check(
    'the new supplier is selected without leaving the bill',
    await waitFor(
      `document.querySelector('[role="combobox"][aria-label="Select supplier"]')?.textContent.includes(${JSON.stringify(INLINE_SUPPLIER)}) === true`
    )
  )
  check(
    'the new supplier is saved with the supplier role',
    (await evaluate(
      `window.api.parties.list({ query: ${JSON.stringify(INLINE_SUPPLIER)} }).then((rows) => rows[0]?.isSupplier === true && rows[0]?.isCustomer === false)`
    )) === true
  )

  check(
    'the line offers the item picker',
    (await clickSelector('[role="combobox"][aria-label="Choose item or use free text"]')) ===
      'clicked'
  )
  check(
    'the item picker offers a create action',
    await waitFor(
      "[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'New item')"
    )
  )
  check('the create action opens the item dialog', (await clickButton('New item')) === 'clicked')
  text = await waitForText(['New item', 'Add item'])
  check('the item dialog opens over the bill', text.includes('Add item'))
  check('the item name field is ready', await waitFor(`document.getElementById('name') !== null`))

  check('the new item name is typed', (await setField('name', INLINE_ITEM)) === 'set')
  check('the purchase price is typed', (await setField('purchasePrice', '125.50')) === 'set')
  check('the item dialog saves', (await clickButton('Add item')) === 'clicked')
  check(
    'the new item is selected on the line',
    await waitFor(
      `document.querySelector('[role="combobox"][aria-label="Item ${INLINE_ITEM}"]') !== null`
    )
  )
  check(
    'the new item fills the description',
    (await evaluate(`
      document.querySelector(${JSON.stringify('input[aria-label="Description for line 1"]')})?.value
    `)) === INLINE_ITEM
  )
  check(
    'the new item fills the purchase rate',
    (await evaluate(`
      document.querySelector(${JSON.stringify('input[aria-label="Rate for line 1"]')})?.value
    `)) === '125.50'
  )
  check(
    'the new item fills the quantity',
    (await evaluate(`
      document.querySelector(${JSON.stringify('input[aria-label="Qty for line 1"]')})?.value
    `)) === '1'
  )

  check('the supplier bill number is typed', (await setField('supplier-bill-no', INLINE_BILL)) === 'set')
  check('the bill posts with the created masters', (await clickButton('Post bill')) === 'clicked')
  // The bill header already shows the bill number and the supplier, so the
  // route change is the only reliable signal that the post finished.
  check(
    'the posted bill opens its detail',
    await waitFor("location.hash.startsWith('#/vouchers/')", 25_000)
  )
  text = await waitForText([INLINE_BILL, INLINE_SUPPLIER])
  check(
    'the detail shows the created supplier and bill number',
    text.includes(INLINE_BILL) && text.includes(INLINE_SUPPLIER),
    text.replace(/\s+/g, ' ').slice(0, 220)
  )

  // -------------------------------------------------------------------
  // A customer created from a receipt's party picker
  // -------------------------------------------------------------------
  console.log('receipt and payment context')
  await goto('/receipts/new', ['New receipt'])
  const receiptTone = await evaluate(`(() => {
    const amount = document.querySelector('input[aria-label="Amount"]')
    const post = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Post '))
    const help = [...document.querySelectorAll('button')].filter((button) => /^About (Outstanding|Allocate)$/.test(button.getAttribute('aria-label') ?? ''))
    const described = help
      .map((button) => {
        const id = button.getAttribute('aria-describedby')
        return id ? document.getElementById(id)?.textContent?.trim() ?? '' : ''
      })
      .join(' ')
    return {
      amountColor: amount ? getComputedStyle(amount).color : null,
      amountBg: amount ? getComputedStyle(amount.closest('div').parentElement).backgroundColor : null,
      postVariant: post?.getAttribute('data-variant') ?? null,
      help: help.length,
      helpText: described
    }
  })()`)
  check(
    'the receipt explains outstanding and allocate',
    receiptTone.help === 2 &&
      /still open/.test(receiptTone.helpText) &&
      /settles/.test(receiptTone.helpText),
    JSON.stringify(receiptTone)
  )
  check(
    'the receipt amount is highlighted',
    receiptTone.amountBg !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(receiptTone)
  )
  check(
    'the receipt posts with the success action',
    receiptTone.postVariant === 'success',
    JSON.stringify(receiptTone)
  )
  await evaluate(`(() => {
    document.querySelector('button[aria-label="About Outstanding"]')?.focus()
    return true
  })()`)
  check(
    'the outstanding tooltip opens on focus',
    await waitFor(
      "document.querySelector('[role=\"tooltip\"]')?.textContent.includes('still open') === true"
    )
  )

  await goto('/payments/new', ['New payment'])
  const paymentTone = await evaluate(`(() => {
    const amount = document.querySelector('input[aria-label="Amount"]')
    const post = [...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Post '))
    return {
      amountColor: amount ? getComputedStyle(amount).color : null,
      amountBg: amount ? getComputedStyle(amount.closest('div').parentElement).backgroundColor : null,
      postVariant: post?.getAttribute('data-variant') ?? null
    }
  })()`)
  check(
    'the payment posts with the warning action',
    paymentTone.postVariant === 'warning',
    JSON.stringify(paymentTone)
  )
  check(
    'receipt and payment use different context colours',
    paymentTone.amountColor !== receiptTone.amountColor &&
      paymentTone.amountBg !== receiptTone.amountBg,
    JSON.stringify({ receiptTone, paymentTone })
  )

  console.log('create from a receipt picker')
  const INLINE_CUSTOMER = 'Inline Customer'

  await goto('/receipts/new', ['Post receipt'])
  check(
    'the receipt offers the customer picker',
    (await clickSelector('[role="combobox"][aria-label="Select customer"]')) === 'clicked'
  )
  check(
    'the receipt picker offers a create action',
    await waitFor(
      "[...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'New customer')"
    )
  )
  check('the receipt create action opens the party dialog', (await clickButton('New customer')) === 'clicked')
  text = await waitForText(['New party', 'Add party'])
  check('the party dialog opens over the receipt', text.includes('Add party'))
  check('the customer name field is ready', await waitFor(`document.getElementById('name') !== null`))

  check('the new customer name is typed', (await setField('name', INLINE_CUSTOMER)) === 'set')
  check('the receipt dialog saves', (await clickButton('Add party')) === 'clicked')
  check(
    'the new customer is selected on the receipt',
    await waitFor(
      `document.querySelector('[role="combobox"][aria-label="Select customer"]')?.textContent.includes(${JSON.stringify(INLINE_CUSTOMER)}) === true`
    )
  )
  check(
    'the new customer is saved with the customer role',
    (await evaluate(
      `window.api.parties.list({ query: ${JSON.stringify(INLINE_CUSTOMER)} }).then((rows) => rows[0]?.isCustomer === true && rows[0]?.isSupplier === false)`
    )) === true
  )

  // -------------------------------------------------------------------
  // Sign out, then the login form's own feedback
  // -------------------------------------------------------------------
  console.log('login form feedback')
  await evaluate('window.api.identity.logout()')
  await evaluate('(() => { setTimeout(() => location.reload(), 50); return true })()')
  await sleep(1500)
  text = await waitForText(['Open your books'])
  check('signing out returns the login form', text.includes('Open your books'))

  check('the login form submits empty', (await clickButton('Sign in')) === 'clicked')
  text = await waitForText(['Enter your email address', 'Enter your password'])
  check(
    'the login errors sit under their fields',
    text.includes('Enter your email address') && text.includes('Enter your password')
  )
  const invalidLogin = await evaluate(`(() => {
    const ids = ['loginEmail', 'loginPassword']
    return ids.map((id) => document.getElementById(id)?.getAttribute('aria-invalid') ?? null)
  })()`)
  check(
    'both login inputs are marked invalid',
    invalidLogin.every((value) => value === 'true'),
    JSON.stringify(invalidLogin)
  )
  check(
    'the login email takes focus',
    (await evaluate('document.activeElement?.id')) === 'loginEmail'
  )

  check('the login email is typed', (await setField('loginEmail', 'owner@smoke.test')) === 'set')
  check(
    'the valid email turns green',
    await waitFor("document.getElementById('loginEmail')?.dataset.valid === 'true'")
  )
  check('the login password is typed', (await setField('loginPassword', 'correct-horse')) === 'set')
  check('the login form signs in', (await clickButton('Sign in')) === 'clicked')
  text = await waitForText(['where the books stand today'], 25_000)
  check('a real sign in opens the dashboard', text.includes(COMPANY))
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
