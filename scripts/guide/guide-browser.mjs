/**
 * Prints the guide with a locally installed Chromium browser.
 *
 * The guide used to render through `playwright`'s bundled Chromium. Only
 * `playwright-core` is installed now (it drives WebView2 for the app captures
 * and does not download a browser), so the PDF renderers borrow the Edge or
 * Chrome that ships with Windows.
 */
import { chromium } from 'playwright-core'

const ARGS = ['--allow-file-access-from-files', '--font-render-hinting=none']

/**
 * @returns {Promise<import('playwright-core').Browser>}
 */
export async function launchGuideBrowser() {
  const failures = []
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, args: ARGS })
    } catch (error) {
      failures.push(`${channel}: ${error.message}`)
    }
  }
  throw new Error(`no Chromium browser available for the PDF render\n${failures.join('\n')}`)
}
