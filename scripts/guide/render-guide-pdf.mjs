/**
 * Renders the user guide HTML to a print-ready A4 PDF.
 *
 *   node scripts/guide/render-guide-pdf.mjs
 */
import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '../..')
const html = resolve(root, 'docs/guides/crown-books-user-guide.html')
const pdf = resolve(root, 'docs/guides/crown-books-user-guide.pdf')

if (!existsSync(html)) throw new Error(`Guide HTML not found: ${html}`)

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

const figures = await page.locator('[data-shot]').count()
const markers = await page.locator('.marker').count()
console.log(`Figures: ${figures}, markers placed: ${markers}`)

await page.pdf({
  path: pdf,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `
    <div style="width:100%; padding:0 16mm; font-family: Arial, sans-serif; font-size:7pt; color:#8a8170; display:flex; align-items:baseline; justify-content:space-between;">
      <span>Crown Books · User Guide · Edition 1.0</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`,
  margin: { top: '20mm', right: '16mm', bottom: '18mm', left: '16mm' },
  scale: 1
})

await browser.close()
console.log(`PDF: ${pdf}`)
