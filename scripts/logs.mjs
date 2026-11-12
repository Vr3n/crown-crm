#!/usr/bin/env node
/**
 * Find, read and follow the app's JSONL logs.
 *
 * Usage:
 *   npm run logs:tail
 *   npm run logs:errors
 *   npm run logs:doctor
 *   node scripts/logs.mjs search "DUPLICATE_SUPPLIER_BILL"
 *   node scripts/logs.mjs trace <traceId>
 *   node scripts/logs.mjs modules
 *   node scripts/logs.mjs open
 *   node scripts/logs.mjs clear --yes
 *
 * Options:
 *   --dir <path>        log directory (default: the app's user data logs)
 *   --level <level>     debug | info | warn | error (warn includes error)
 *   --module <name>     api, rpc, import, vouchers, db, auth, app, ...
 *   --trace <id>        one trace id
 *   --since <duration>  10m, 2h, 7d, or an ISO timestamp
 *   --lines <n>         tail size (default 80)
 *   --limit <n>         search/error limit (default 200)
 *   --query <text>      literal text search
 *   --json              print the matching records as JSON
 *   --follow            keep following the newest file (tail only)
 *   --no-color          disable ANSI colour
 *   --yes               confirm a destructive command (clear)
 */

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import {
  filterRecords,
  formatRecord,
  isLogFileName,
  parseLogLines,
  resolveLogDir,
  sortRecords,
  summarize
} from './lib/logs-core.mjs'

const argv = process.argv.slice(2)
const command = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'tail'
const rest = command === argv[0] ? argv.slice(1) : argv

function parseArgs(args) {
  const options = { positional: [] }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!arg.startsWith('--')) {
      options.positional.push(arg)
      continue
    }
    const [rawKey, inline] = arg.slice(2).split('=', 2)
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    if (inline !== undefined) {
      options[key] = inline
      continue
    }
    const next = args[index + 1]
    if (next && !next.startsWith('--')) {
      options[key] = next
      index += 1
    } else {
      options[key] = true
    }
  }
  return options
}

const options = parseArgs(rest)
const dir = resolveLogDir({ dir: options.dir })
const color = Boolean(process.stdout.isTTY) && options.noColor !== true
const formatOptions = { color }

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function logFiles() {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(isLogFileName)
    .sort()
    .map((name) => join(dir, name))
}

function readRecords() {
  const records = []
  for (const file of logFiles()) {
    records.push(...parseLogLines(readFileSync(file, 'utf8')))
  }
  return sortRecords(records)
}

function printRecords(records) {
  if (options.json) {
    console.log(JSON.stringify(records, null, 2))
    return
  }
  for (const record of records) console.log(formatRecord(record, formatOptions))
}

function noLogs() {
  fail(
    `No log files in ${dir}\nStart the desktop app once, or pass --dir / set CROWN_BOOKS_USER_DATA.`
  )
}

function tail() {
  const records = readRecords()
  if (records.length === 0) {
    noLogs()
    return
  }
  const lines = Number(options.lines ?? 80)
  printRecords(records.slice(-Math.max(1, lines)))
  if (options.follow === true) {
    const files = logFiles()
    const newest = files.at(-1)
    const newestCount = newest ? parseLogLines(readFileSync(newest, 'utf8')).length : 0
    follow(newestCount)
  }
}

function follow(initialSeen = 0) {
  let seen = initialSeen
  let current = null
  const tick = () => {
    const files = logFiles()
    const newest = files.at(-1)
    if (!newest) return
    if (newest !== current) {
      current = newest
      seen = 0
    }
    try {
      const text = readFileSync(current, 'utf8')
      const records = parseLogLines(text)
      if (records.length < seen) seen = 0
      for (const record of records.slice(seen)) {
        console.log(formatRecord(record, formatOptions))
      }
      seen = records.length
    } catch {
      // The file may be rotating or half-written. Try again next tick.
    }
  }
  tick()
  setInterval(tick, 500)
}

function search() {
  const query = options.query ?? options.positional.join(' ')
  if (!query) {
    fail('Give a search text: node scripts/logs.mjs search "text"')
    return
  }
  const records = filterRecords(readRecords(), {
    query,
    level: options.level,
    module: options.module,
    trace: options.trace,
    since: options.since
  })
  const limit = Number(options.limit ?? 200)
  if (records.length === 0) {
    console.log(`No records matched "${query}" in ${dir}.`)
    return
  }
  printRecords(records.slice(-limit))
  if (records.length > limit) {
    console.log(`\nShowing the last ${limit} of ${records.length} matches.`)
  }
}

function errors() {
  const records = filterRecords(readRecords(), {
    level: 'error',
    module: options.module,
    since: options.since ?? '1h'
  })
  if (records.length === 0) {
    console.log(`No errors in ${options.since ?? '1h'} in ${dir}.`)
    return
  }
  printRecords(records.slice(-Number(options.limit ?? 50)))
}

function trace() {
  const traceId = options.trace ?? options.positional[0]
  if (!traceId) {
    fail('Give a trace id: node scripts/logs.mjs trace <id>')
    return
  }
  const records = filterRecords(readRecords(), { trace: traceId })
  if (records.length === 0) {
    console.log(`No records for trace ${traceId}.`)
    return
  }
  printRecords(records)
}

function modules() {
  const records = readRecords()
  if (records.length === 0) {
    noLogs()
    return
  }
  const rows = summarize(records)
  const header = ['MODULE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'TOTAL']
  const widths = [18, 6, 6, 6, 6, 6]
  console.log(header.map((label, index) => label.padEnd(widths[index])).join(' '))
  for (const row of rows) {
    console.log(
      [row.module, row.debug, row.info, row.warn, row.error, row.total]
        .map((value, index) => String(value).padEnd(widths[index]))
        .join(' ')
    )
  }
}

function doctor() {
  const files = logFiles()
  const records = readRecords()
  const errorsInLog = records.filter((record) => record.level === 'error')
  console.log(`log directory : ${dir}`)
  console.log(`exists        : ${existsSync(dir) ? 'yes' : 'no'}`)
  console.log(`files         : ${files.length}`)
  console.log(`newest        : ${files.at(-1) ?? '-'}`)
  console.log(`records       : ${records.length}`)
  console.log(`errors        : ${errorsInLog.length}`)
  const lastError = errorsInLog.at(-1)
  if (lastError) {
    console.log(`last error    : ${lastError.ts} ${lastError.module} ${lastError.event}`)
    console.log(`                ${lastError.error?.code ?? ''} ${lastError.error?.message ?? ''}`)
  }
  console.log(`database      : ${join(dir, '..', 'crown-books.db')}`)
  console.log('')
  console.log('Useful commands:')
  console.log('  npm run logs:tail')
  console.log('  npm run logs:errors')
  console.log('  npm run logs -- trace <traceId>')
  console.log('  npm run logs -- search "DUPLICATE_SUPPLIER_BILL"')
}

function openDir() {
  if (!existsSync(dir)) {
    noLogs()
    return
  }
  const opener =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  execFile(opener, [dir], (error) => {
    if (error) fail(`Could not open ${dir}: ${error.message}`)
  })
}

function clear() {
  const files = logFiles()
  if (options.yes !== true) {
    console.log(`Would delete ${files.length} file(s) in ${dir}.`)
    console.log('Run again with --yes to delete them.')
    return
  }
  let deleted = 0
  for (const file of files) {
    try {
      unlinkSync(file)
      deleted += 1
    } catch {
      // Ignore a file another process is holding.
    }
  }
  console.log(`Deleted ${deleted} file(s) from ${dir}.`)
}

switch (command) {
  case 'tail':
    tail()
    break
  case 'search':
    search()
    break
  case 'errors':
    errors()
    break
  case 'trace':
    trace()
    break
  case 'modules':
    modules()
    break
  case 'doctor':
    doctor()
    break
  case 'open':
    openDir()
    break
  case 'clear':
    clear()
    break
  case 'path':
    console.log(dir)
    break
  case 'help':
  case '--help':
  case '-h':
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''))
    break
  default:
    fail(`Unknown command: ${command}\nTry: tail, search, errors, trace, modules, doctor, open, clear, path`)
}
