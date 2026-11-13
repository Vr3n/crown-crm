/**
 * Pure helpers for `scripts/logs.mjs`.
 *
 * Kept separate so the parser, filters and formatting can be tested without
 * starting the desktop app or reading the user's log directory.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

export function severity(level) {
  return LEVELS[level] ?? LEVELS.info
}

/** Parse a JSONL log file, skipping blank and malformed lines. */
export function parseLogLines(text) {
  const records = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const record = JSON.parse(trimmed)
      if (record && typeof record === 'object' && typeof record.ts === 'string') {
        records.push(record)
      }
    } catch {
      // A half-written line at the end of a live file is normal. Skip it.
    }
  }
  return records
}

/** A duration such as `10m`, `2h`, `30s`, or an ISO timestamp. */
export function parseSince(value, now = Date.now()) {
  if (!value) return 0
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(String(value).trim())
  if (match) {
    const amount = Number(match[1])
    const multiplier = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]
    return now - amount * multiplier
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function filterRecords(records, options = {}) {
  const minimum = options.level ? severity(options.level) : 0
  const since = parseSince(options.since)
  const query = options.query ? String(options.query).toLowerCase() : ''
  return records.filter((record) => {
    if (minimum && severity(record.level) < minimum) return false
    if (options.module && record.module !== options.module) return false
    if (options.trace && record.traceId !== options.trace) return false
    if (since && Date.parse(record.ts) < since) return false
    if (query && !JSON.stringify(record).toLowerCase().includes(query)) return false
    return true
  })
}

export function sortRecords(records) {
  return [...records].sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}

export function formatRecord(record, options = {}) {
  const color = options.color === true
  const time = String(record.ts ?? '').slice(11, 23)
  const level = String(record.level ?? 'info').toUpperCase().padEnd(5)
  const source = String(record.source ?? '?').padEnd(8)
  const module = String(record.module ?? '?').padEnd(10)
  const event = String(record.event ?? '?').padEnd(22)
  const trace = record.traceId ? ` ${record.traceId}` : ''
  const fields =
    record.fields && Object.keys(record.fields).length > 0
      ? ` ${JSON.stringify(record.fields)}`
      : ''
  const error = record.error
    ? ` error=${record.error.code ?? ''}${record.error.message ? ` ${record.error.message}` : ''}`
    : ''
  const line = `${time} ${level} ${source} ${module} ${event}${trace}${fields}${error}`.trimEnd()
  if (!color) return line
  const tone =
    record.level === 'error'
      ? '\u001b[31m'
      : record.level === 'warn'
        ? '\u001b[33m'
        : record.level === 'debug'
          ? '\u001b[90m'
          : '\u001b[36m'
  return line.replace(level, `${tone}${level}\u001b[0m`)
}

export function summarize(records) {
  const byModule = new Map()
  for (const record of records) {
    const module = record.module ?? 'unknown'
    const row = byModule.get(module) ?? { module, debug: 0, info: 0, warn: 0, error: 0, total: 0 }
    const level = record.level ?? 'info'
    if (level in row) row[level] += 1
    row.total += 1
    byModule.set(module, row)
  }
  return [...byModule.values()].sort((a, b) => b.total - a.total)
}

export function isLogFileName(name) {
  return /^app-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)
}

/**
 * The same directory `Paths::resolve` uses in the Rust shell.
 *
 * `profile` is `dev`, `release` or `auto`. Auto prefers the dev folder when it
 * exists, because this CLI is usually run while developing. Pass `--dev` or
 * `--release` to be explicit. `CROWN_BOOKS_USER_DATA` still wins.
 */
export function resolveLogDir({ dir, env = process.env, profile = 'auto' } = {}) {
  if (dir) return resolve(dir)
  const override = env.CROWN_BOOKS_USER_DATA?.trim()
  if (override) return join(override, 'logs')
  const base = env.APPDATA || env.HOME || '.'
  const releaseDir = env.APPDATA ? join(base, 'Crown Books') : join(base, '.crown-books')
  const devDir = env.APPDATA ? join(base, 'Crown Books Dev') : join(base, '.crown-books-dev')
  if (profile === 'dev') return join(devDir, 'logs')
  if (profile === 'release') return join(releaseDir, 'logs')
  return existsSync(devDir) ? join(devDir, 'logs') : join(releaseDir, 'logs')
}

