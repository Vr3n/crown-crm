/**
 * Starts the Tauri build of Crown Books and attaches Playwright over the
 * DevTools protocol exposed by WebView2.
 *
 * The old capture scripts launched Electron with `playwright._electron`. The
 * app is a Tauri executable now, so the desktop shell cannot be launched by
 * Playwright. Instead the executable is spawned with WebView2 remote debugging
 * enabled, and `chromium.connectOverCDP` attaches to the page that WebView2
 * exposes on the debugging port.
 *
 * Capture geometry is pinned so the screenshots match the size the guide
 * layout was measured against:
 *
 *   guide figures     1428 x 834.4 CSS at scale 1.25 -> 1785 x 1043
 *   quick-start views 1424 x 861   CSS at scale 1    -> 1424 x 861
 *
 * `sync-annotations.mjs` and `crop-guide-assets.py` assume 1785 x 1043 for the
 * full guide captures, and the quick-start clip is measured from 1424 wide.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

export const CAPTURE_WIDTH = 1785
export const CAPTURE_HEIGHT = 1043
export const CAPTURE_SCALE = 1.25

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * The release executable produced by `npx tauri build --no-bundle`.
 * @returns {string}
 */
export function defaultExecutable() {
  return resolve(
    join('src-tauri', 'target', 'release', process.platform === 'win32' ? 'crown-books.exe' : 'crown-books')
  )
}

/**
 * Waits for WebView2 to expose a page target on the debugging port.
 * @param {number} port
 * @returns {Promise<void>}
 */
async function waitForTarget(port) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        if (targets.some((target) => target.type === 'page' && target.webSocketDebuggerUrl)) return
      }
    } catch {
      // WebView2 is still starting.
    }
    await sleep(250)
  }
  throw new Error(`no WebView2 page target on port ${port}`)
}

/**
 * Spawns the desktop app and returns a Playwright page attached to it.
 *
 * @param {{
 *   port?: number,
 *   exe?: string,
 *   userData?: string,
 *   width?: number,
 *   height?: number,
 *   scale?: number
 * }} [options]
 * @returns {Promise<{ page: import('playwright-core').Page, close: () => Promise<void> }>}
 */
export async function launchCapture({
  port = 9333,
  exe = defaultExecutable(),
  userData,
  width = Math.round(CAPTURE_WIDTH / CAPTURE_SCALE),
  height = Math.round(CAPTURE_HEIGHT / CAPTURE_SCALE),
  scale = CAPTURE_SCALE
} = {}) {
  if (!existsSync(exe)) {
    throw new Error(`no Tauri build at ${exe}; run \`npx tauri build --no-bundle\` first`)
  }

  const dataDir = userData ?? mkdtempSync(join(tmpdir(), 'crown-guide-'))
  const ownsData = userData === undefined

  const child = spawn(exe, [], {
    env: {
      ...process.env,
      CROWN_BOOKS_USER_DATA: dataDir,
      CROWN_BOOKS_E2E: '1',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --force-device-scale-factor=${scale}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  /** Waits for the app to release its database, then removes the temp profile. */
  async function stop() {
    if (child.exitCode === null) {
      child.kill()
      await Promise.race([
        new Promise((done) => child.once('exit', done)),
        sleep(3_000)
      ])
    }
    if (ownsData) {
      try {
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      } catch {
        // Windows can keep the WebView2 profile locked for a moment.
      }
    }
  }

  let browser
  try {
    await waitForTarget(port)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000 })

    const deadline = Date.now() + 30_000
    let page = null
    while (!page && Date.now() < deadline) {
      for (const context of browser.contexts()) {
        page = context.pages().find((candidate) => candidate.url() !== 'about:blank') ?? null
        if (page) break
      }
      if (!page) await sleep(200)
    }
    if (!page) throw new Error('WebView2 connected but no page appeared')

    // The Tauri window is 1440 x 900 with decorations, and the guide was
    // measured on a larger viewport. Overriding the metrics makes every
    // capture independent of the window chrome and the monitor's DPI.
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false
    })
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(900)

    return {
      page,
      cdp,
      async close() {
        try {
          await browser?.close()
        } catch {
          // The app may already be gone.
        }
        await stop()
        if (stderr.trim()) console.warn(stderr.trim())
      }
    }
  } catch (error) {
    try {
      await browser?.close()
    } catch {
      // Ignore teardown failures.
    }
    await stop()
    const detail = stderr.trim() ? `\n${stderr.trim()}` : ''
    throw new Error(`${error.message}${detail}`)
  }
}
