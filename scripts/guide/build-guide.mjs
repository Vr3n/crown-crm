/**
 * Assembles the print source for the Crown Books user guide.
 *
 *   node scripts/guide/build-guide.mjs
 *
 * The guide is split into one partial per chapter under docs/guides/src/.
 * The build inlines the print stylesheet and checks that every screenshot
 * referenced by the HTML exists.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const srcDir = join(root, 'docs/guides/src')
const out = join(root, 'docs/guides/crown-books-user-guide.html')
const shotsDir = join(root, 'docs/guides/assets/screens')

const template = readFileSync(join(srcDir, 'template.html'), 'utf8')
const css = readFileSync(join(srcDir, 'guide.css'), 'utf8')
const partials = readdirSync(srcDir)
  .filter((name) => /^\d+-.+\.html$/.test(name))
  .sort()

if (!partials.length) throw new Error('No guide partials found')

const content = partials
  .map((name) => readFileSync(join(srcDir, name), 'utf8').trimEnd())
  .join('\n\n')

const html = template.replace('{{CSS}}', css.trimEnd()).replace('{{CONTENT}}', content)

const referenced = [...html.matchAll(/assets\/screens\/([\w.-]+\.png)/g)].map((match) => match[1])
const missing = [...new Set(referenced)].filter((name) => !existsSync(join(shotsDir, name)))
if (missing.length) throw new Error(`Missing screenshots: ${missing.join(', ')}`)

const figures = (html.match(/class="fig-no"/g) ?? []).length
const markers = (html.match(/class="marker"/g) ?? []).length
const sections = (html.match(/<h2[ >]/g) ?? []).length

writeFileSync(out, html)

console.log(`Built ${out}`)
console.log(`Partials: ${partials.length}, sections: ${sections}, figures: ${figures}, markers: ${markers}`)
