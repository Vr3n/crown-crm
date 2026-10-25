/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Copies the callout positions measured by capture-guide.mjs into the guide
 * partials.
 *
 *   node scripts/guide/sync-annotations.mjs
 *
 * capture-guide.mjs records each marker as a percentage of the full window, in
 * the order the markers appear on the page. Some figures use a cropped copy of
 * that capture, so the percentage has to be remapped to the crop before it is
 * written into docs/guides/src/. The crop heights must stay in step with
 * scripts/guide/crop-guide-assets.py.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const srcDir = join(root, 'docs/guides/src')
const assetsDir = join(root, 'docs/guides/assets')
const annotations = JSON.parse(readFileSync(join(assetsDir, 'annotations.json'), 'utf8'))

const FULL_WIDTH = 1785
const FULL_HEIGHT = 1043

/** Top crops used by the report screenshots. */
const CROPS = {
  '12-payables': 620,
  '17-receivables': 620,
  '18-ageing': 620,
  '20-sales-register': 650,
  '21-purchase-register': 630,
  '28-journals': 620,
  '30-backup': 620
}

/**
 * The first-run form is the right-hand panel of the splash screen.
 */
const FIRST_RUN_FORM = {
  x: Math.trunc(FULL_WIDTH * 0.5686),
  width: FULL_WIDTH - Math.trunc(FULL_WIDTH * 0.5686)
}

function remap(image, mark) {
  const raw = image.replace(/\.png$/, '')
  const stripped = raw.replace(/-detail$/, '')
  let x = mark.xPct
  let y = mark.yPct

  if (image === '00-first-run-form.png') {
    x = (((x / 100) * FULL_WIDTH - FIRST_RUN_FORM.x) / FIRST_RUN_FORM.width) * 100
  } else if (CROPS[stripped] && stripped !== raw) {
    y = (((y / 100) * FULL_HEIGHT) / CROPS[stripped]) * 100
  }

  return {
    x: Math.min(97.5, Math.max(1.5, Number(x.toFixed(2)))),
    y: Math.min(97.5, Math.max(1.5, Number(y.toFixed(2))))
  }
}

let updated = 0
let skipped = 0

for (const file of readdirSync(srcDir).filter((name) => /^\d+-.+\.html$/.test(name))) {
  const path = join(srcDir, file)
  const source = readFileSync(path, 'utf8')

  const next = source.replace(/<div class="shot">[\s\S]*?<\/div>/g, (block) => {
    const image = block.match(/assets\/screens\/([\w.-]+\.png)/)?.[1]
    if (!image) return block

    const raw = image.replace(/\.png$/, '')
    const stripped = raw.replace(/-detail$/, '')
    const key = annotations[raw]
      ? raw
      : annotations[stripped]
        ? stripped
        : image === '00-first-run-form.png'
          ? '00-first-run'
          : null
    const marks = key ? annotations[key] : []
    let index = 0

    return block.replace(
      /<span class="marker" style="left: [\d.]+%; top: [\d.]+%">(\d+)<\/span>/g,
      (span, label) => {
        const position = marks[index] ? remap(image, marks[index]) : null
        index += 1
        if (!position) {
          skipped += 1
          console.warn(`  ! no position ${index} for ${image} (${file})`)
          return span
        }
        updated += 1
        return `<span class="marker" style="left: ${position.x}%; top: ${position.y}%">${label}</span>`
      }
    )
  })

  if (next !== source) writeFileSync(path, next)
}

console.log(`Updated ${updated} markers${skipped ? `, ${skipped} left unchanged` : ''}`)

// The quick start reads the same measurements at runtime. Its first-run figure
// is the cropped right-hand panel, so expose a remapped copy under its own key.
const firstRunForm = (annotations['00-first-run'] ?? []).map((mark) => ({
  ...mark,
  xPct: Number(
    ((((mark.xPct / 100) * FULL_WIDTH - FIRST_RUN_FORM.x) / FIRST_RUN_FORM.width) * 100).toFixed(2)
  )
}))

writeFileSync(
  join(assetsDir, 'annotations.js'),
  `window.CROWN_ANNOTATIONS=${JSON.stringify({ ...annotations, '00-first-run-form': firstRunForm })};\n`
)
console.log('Updated assets/annotations.js')
