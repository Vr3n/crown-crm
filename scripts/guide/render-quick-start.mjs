/**
 * Renders the seven-page quick start to A4.
 *
 *   node scripts/guide/render-quick-start.mjs
 *   node scripts/guide/render-quick-start.mjs path/to/output.pdf
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const html = resolve(root, 'docs/guides/crown-books-10-minute-quick-start.html')
const pdf = resolve(root, process.argv[2] ?? 'docs/guides/crown-books-10-minute-quick-start.pdf')

if (!existsSync(html)) throw new Error(`Quick-start HTML not found: ${html}`)

const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--font-render-hinting=none']
})
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } })
await page.goto(pathToFileURL(html).href, { waitUntil: 'load' })
await page.evaluate(async () => {
  await document.fonts.ready
  await Promise.all(
    Array.from(document.images).map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise((resolveImage) => {
            image.addEventListener('load', resolveImage, { once: true })
            image.addEventListener('error', resolveImage, { once: true })
          })
    )
  )
})

const images = await page.locator('img').count()
console.log(`Images: ${images}`)

await page.pdf({
  path: pdf,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: false,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  scale: 1
})

await browser.close()
console.log(`PDF: ${pdf}`)
