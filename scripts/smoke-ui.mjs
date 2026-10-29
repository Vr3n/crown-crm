#!/usr/bin/env node
/**
 * Renderer smoke test.
 *
 * Starts the built app with WebView2 remote debugging enabled, attaches to the
 * page over the DevTools protocol, and asserts that React actually mounted and
 * that the IPC bridge answers through the production Content-Security-Policy.
 * A blank window (CSP error, bad asset path, broken import) fails here even
 * though the process stays alive.
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

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

/** @returns {Promise<void>} */
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

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
  const target = await findTarget()
  if (!target) throw new Error('no page target')

  return new Promise((done, failed) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    const timer = setTimeout(() => {
      socket.close()
      failed(new Error('DevTools evaluate timed out'))
    }, 8000)

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
        failed(new Error(message.result.exceptionDetails.text))
      } else done(message.result?.result?.value)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      failed(new Error('DevTools socket failed'))
    })
  })
}

/** @returns {void} */
function stop() {
  if (!child.killed) child.kill()
}

try {
  const deadline = Date.now() + 30_000
  let target = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`app exited early with code ${child.exitCode}`)
    target = await findTarget()
    if (target) break
    await sleep(300)
  }
  if (!target) throw new Error(`WebView2 never exposed DevTools on port ${port}`)

  // React must mount and paint something before the assertion below is useful.
  let text = ''
  while (Date.now() < deadline) {
    text = String(await evaluate('document.body.innerText'))
    if (text.trim().length > 0) break
    await sleep(300)
  }

  const problems = []
  if (!text.includes('Set up the books')) problems.push('the first-run heading did not render')
  if (text.length < 40) problems.push(`the page is nearly empty (${text.length} chars)`)

  // The bridge must reach Rust through the production CSP.
  const status = String(await evaluate('window.api.identity.status()'))
  if (status !== 'SETUP_REQUIRED') problems.push(`identity.status returned ${status}`)

  const hasBridge = await evaluate('typeof window.api.vouchers.post === "function"')
  if (hasBridge !== true) problems.push('window.api is incomplete')

  // The whole first-run path, through the real UI and the real Rust backend:
  // setup writes the company, seeds roles and defaults, signs the owner in, and
  // the auth gate must swap to the dashboard.
  if (problems.length === 0) {
    const companyName = 'Smoke Test Traders'
    const created = await evaluate(`window.api.identity.setup({
      name: '${companyName}',
      ownerFullName: 'Smoke Owner',
      ownerEmail: 'owner@smoke.test',
      ownerPassword: 'correct-horse',
      stateCode: '27',
      booksBeginDate: '2026-04-01'
    }).then((session) => session.companyName)`)

    if (created !== companyName) {
      problems.push(`identity.setup returned ${created}`)
    } else {
      // The direct API call bypasses React Query's mutation, so reload the page
      // the way a restart would: the remembered session is restored and the auth
      // gate must move past the setup screen into the first-run wizard.
      await evaluate('(() => { setTimeout(() => location.reload(), 50); return true })()')
      await sleep(1500)

      let screen = ''
      const screenDeadline = Date.now() + 25_000
      while (Date.now() < screenDeadline) {
        screen = String(await evaluate('document.body.innerText'))
        const movedOn = !screen.includes('Set up the books') && screen.includes('Number your vouchers')
        if (movedOn) break
        await sleep(400)
      }
      if (screen.includes('Set up the books')) {
        problems.push('the setup screen was still showing after setup')
      } else if (!screen.includes('Number your vouchers')) {
        problems.push('the first-run wizard did not render after setup')
      }

      const company = await evaluate('window.api.identity.company().then((row) => row && row.name)')
      if (company !== companyName) problems.push(`identity.company returned ${company}`)
    }

    const summary = await evaluate('window.api.dashboard.summary()')
    if (summary === null || typeof summary !== 'object') {
      problems.push('dashboard.summary did not return an object')
    }

    const vouchers = await evaluate('window.api.vouchers.list({})')
    if (!Array.isArray(vouchers)) {
      problems.push('vouchers.list did not return an array')
    }

    const numbering = await evaluate('window.api.numbering.list()')
    if (!Array.isArray(numbering) || numbering.length !== 9) {
      problems.push(`numbering.list returned ${Array.isArray(numbering) ? numbering.length : 'nothing'}`)
    }
  }

  if (problems.length > 0) {
    console.error(`smoke-ui: ${problems.join('; ')}`)
    console.error(`smoke-ui: rendered text was:\n${text.slice(0, 400)}`)
    if (stderr.trim()) console.error(stderr.trim())
    process.exitCode = 1
  } else {
    console.log('smoke-ui: ok — React mounted, window.api answered SETUP_REQUIRED')
    console.log(`smoke-ui: ${text.replace(/\s+/g, ' ').slice(0, 120)}…`)
  }
} catch (error) {
  console.error(`smoke-ui: ${error.message}`)
  if (stderr.trim()) console.error(stderr.trim())
  process.exitCode = 1
} finally {
  stop()
  await sleep(500)
  rmSync(dataDir, { recursive: true, force: true })
}
