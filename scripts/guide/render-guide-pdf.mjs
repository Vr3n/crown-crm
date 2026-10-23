/**
 * Renders the guide HTML to a print-ready A4 PDF.
 *
 *   node scripts/guide/render-guide-pdf.mjs
 *   node scripts/guide/render-guide-pdf.mjs docs/guides/crown-books-10-minute-quick-start.html docs/guides/crown-books-10-minute-quick-start.pdf --quick
 *
 * For the full guide it runs two passes: the first pass finds the page on which
 * each chapter starts, the numbers are filled into the contents page, and the
 * second pass writes the final PDF. Bookmarks and metadata are added afterwards.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '../..')
const quick = process.argv.includes('--quick')
const html = resolve(root, process.argv[2] ?? 'docs/guides/crown-books-user-guide.html')
const pdf = resolve(root, process.argv[3] ?? 'docs/guides/crown-books-user-guide.pdf')
const assets = join(root, 'docs/guides/assets')
const passOne = join(assets, '.pass-one.pdf')
const pagesJson = join(assets, '.chapter-pages.json')
const bookmarksJson = join(assets, '.bookmarks.json')

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

const figures = await page.locator('.fig-no').count()
const markers = await page.locator('.marker').count()
const numberedToc = await page.locator('.pg[data-page]').count()
const brokenImages = await page.$$eval('img', (images) =>
  images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src'))
)
if (brokenImages.length) throw new Error(`Images failed to load: ${brokenImages.join(', ')}`)
const chapters = await page.$$eval('.chapter', (sections) =>
  sections.map((section) => ({
    id: section.id,
    title: section.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() ?? section.id
  }))
)
console.log(`Figures: ${figures}, markers placed: ${markers}`)

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const print = (path) =>
  page.pdf({
    path,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: !quick,
    headerTemplate: '<span></span>',
    footerTemplate: `
      <div style="width:100%; padding:0 8mm; font-family: Arial, sans-serif; font-size:7pt; color:#6b6f6c; display:flex; align-items:baseline; justify-content:space-between;">
        <span>Crown Books · User guide · Edition 1.0</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    margin: quick
      ? { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' }
      : { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
    scale: 1
  })

if (numberedToc && !quick) {
  await print(passOne)

  execFileSync('uv', ['run', '--with', 'pymupdf', 'python', join(root, 'scripts/guide/pdf_pages.py'), passOne, pagesJson], {
    stdio: ['ignore', 'inherit', 'inherit']
  })
  const pages = JSON.parse(readFileSync(pagesJson, 'utf8'))

  await page.evaluate((pageMap) => {
    document.querySelectorAll('.pg[data-page]').forEach((element) => {
      const number = pageMap[element.getAttribute('data-page')]
      if (number) element.textContent = String(number)
    })
  }, pages)

  const toc = [
    [1, 'Cover', 1],
    [1, 'How to use this guide', 2],
    [1, 'Contents', 3],
    ...chapters
      .filter((chapter) => pages[chapter.id])
      .map((chapter) => [1, `${chapter.id.slice(-2)}. ${chapter.title}`, pages[chapter.id]])
  ]

  writeFileSync(
    bookmarksJson,
    JSON.stringify(
      {
        toc,
        metadata: {
          title: 'Crown Books User Guide',
          author: 'Crown Books',
          subject: 'Edition 1.0 - October 2026',
          keywords: 'Crown Books, accounting, GST, user guide, invoicing, inventory',
          creator: 'Crown Books guide build'
        }
      },
      null,
      2
    )
  )
}

await print(pdf)

if (numberedToc && !quick) {
  execFileSync(
    'uv',
    ['run', '--with', 'pymupdf', 'python', join(root, 'scripts/guide/pdf_polish.py'), pdf, bookmarksJson],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  )
  for (const temporary of [passOne, pagesJson, bookmarksJson]) {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

await browser.close()
console.log(`PDF: ${pdf}`)
