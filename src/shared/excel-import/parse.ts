import { fieldsFor } from './fields'
import type { CellRange, CellValue, ImportTarget } from './types'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Lowercase, punctuation to spaces, collapsed. Used for header matching. */
export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalise a party name for matching. Legal suffixes and punctuation differ
 * between a bill and a master; the business behind the name does not.
 */
export function normalizePartyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(m s|messrs|pvt|private|ltd|limited|llp|inc|incorporated|co|company)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A cell as text, with dates in the Indian reading order. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value).trim()
}

export function isBlankRow(row: CellValue[] | undefined): boolean {
  if (!row) return true
  return row.every((cell) => cellText(cell).length === 0)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (year < 1900 || year > 2200) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function formatDate(date: Date): string {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`
}

/**
 * Parse a spreadsheet date. Accepts a real date cell, an Excel serial number,
 * and the formats an Indian small business actually types.
 *
 * Ambiguous slash dates are read day first, because `05/04/2026` in this market
 * is 5 April, not 4 May.
 */
export function parseDateCell(value: CellValue): string | null {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return isoFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 2_958_465) return null
    // Excel's day zero is 1899-12-30, which also absorbs the 1900 leap bug.
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000
    const date = new Date(ms)
    return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  if (typeof value === 'boolean') return null

  const text = value.trim()
  if (!text) return null

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return isoFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dayFirst = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dayFirst) {
    const day = Number(dayFirst[1])
    const month = Number(dayFirst[2])
    let year = Number(dayFirst[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    return isoFromParts(year, month, day)
  }

  // A CSV export sometimes writes the Excel serial as text.
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text)
    if (serial > 20_000 && serial < 60_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    }
  }

  const named = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})$/)
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()) + 1
    let year = Number(named[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    return isoFromParts(year, month, Number(named[1]))
  }

  const namedFirst = text.match(/^([A-Za-z]{3,9})[\s-]+(\d{1,2})[\s,-]+(\d{2,4})$/)
  if (namedFirst) {
    const month = MONTHS.indexOf(namedFirst[1].slice(0, 3).toLowerCase()) + 1
    let year = Number(namedFirst[3])
    if (year < 100) year += year < 70 ? 2000 : 1900
    return isoFromParts(year, month, Number(namedFirst[2]))
  }

  return null
}

/** A plain number, tolerating currency symbols, Indian grouping and brackets. */
export function parseNumberCell(value: CellValue): number | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return null

  let text = value.trim()
  if (!text) return null
  const negative = /^\(.*\)$/.test(text)
  text = text
    .replace(/^\(|\)$/g, '')
    .replace(/[₹$€£]/g, '')
    .replace(/\b(rs|inr)\b\.?/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
  if (!/^[-+]?\d*\.?\d+$/.test(text)) return null
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}

/**
 * A GST or discount rate as basis points.
 *
 * Excel stores a cell formatted as 18% as the number 0.18. A plain number below
 * one is therefore read as a fraction. A string that carries a percent sign is
 * read literally, so "0.5%" means 50 basis points.
 */
export function parsePercentCell(value: CellValue): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.includes('%')) {
    const parsed = parseNumberCell(value.replace(/%/g, ''))
    return parsed === null ? null : Math.round(parsed * 100)
  }
  const parsed = parseNumberCell(value)
  if (parsed === null) return null
  // Excel stores 18% as 0.18. A CSV export can carry the same fraction as text.
  if (parsed > 0 && parsed < 1) return Math.round(parsed * 10_000)
  return Math.round(parsed * 100)
}

/** Quantity scaled by 10,000, the domain's storage unit. */
export function parseQuantityE4(value: CellValue): number | null {
  const parsed = parseNumberCell(value)
  if (parsed === null) return null
  return Math.round(parsed * 10_000)
}

/** Rupees to paise. */
export function parseMoneyMinor(value: CellValue): number | null {
  const parsed = parseNumberCell(value)
  if (parsed === null) return null
  return Math.round(parsed * 100)
}

/** A two digit state code, tolerant of a state name being present. */
export function parseStateCode(value: CellValue): string | null {
  const text = cellText(value)
  const match = text.match(/\b(\d{2})\b/)
  return match ? match[1] : null
}

export function columnLetter(index: number): string {
  let value = index + 1
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

export function rangeAddress(range: CellRange): string {
  const start = `${columnLetter(range.startCol)}${range.startRow + 1}`
  const end = `${columnLetter(range.endCol)}${range.endRow + 1}`
  return start === end ? start : `${start}:${end}`
}

function aliasScore(header: string, aliases: string[]): number {
  const normalized = normalizeHeader(header)
  if (!normalized) return 0
  if (aliases.includes(normalized)) return 3
  if (aliases.some((alias) => normalized === alias || normalized.startsWith(`${alias} `))) return 2
  if (aliases.some((alias) => normalized.includes(alias))) return 1
  return 0
}

/**
 * Pick the row that reads like column names.
 *
 * The first ten rows of the range are candidates. A row wins on how many of its
 * cells match a known header alias, so a title in row 1 does not beat the real
 * header in row 4. When nothing matches, the first row with at least two
 * non-empty cells is used, and the user can still move it.
 */
export function detectHeaderRow(
  rows: CellValue[][],
  range: CellRange,
  target: ImportTarget
): number | null {
  const aliases = fieldsFor(target).flatMap((field) =>
    field.aliases.map((alias) => normalizeHeader(alias))
  )
  const lastCandidate = Math.min(range.endRow, range.startRow + 9)
  let bestRow: number | null = null
  let bestScore = 0

  for (let rowIndex = range.startRow; rowIndex <= lastCandidate; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    let matches = 0
    let filled = 0
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const text = cellText(row[col])
      if (!text) continue
      filled += 1
      if (aliasScore(text, aliases) > 0) matches += 1
    }
    const score = matches * 10 + Math.min(filled, 9)
    if (matches >= 2 && score > bestScore) {
      bestScore = score
      bestRow = rowIndex
    }
  }

  if (bestRow !== null) return bestRow

  for (let rowIndex = range.startRow; rowIndex <= lastCandidate; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    let filled = 0
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      if (cellText(row[col])) filled += 1
    }
    if (filled >= 2) return rowIndex
  }

  return null
}

/**
 * A best guess at the table itself.
 *
 * Start from the detected header, take the contiguous rows below it, stop at a
 * blank row or a total row, and trim columns that hold nothing. The user still
 * owns the range; this only saves the common case from a drag.
 */
export function suggestTableRange(
  rows: CellValue[][],
  sheet: string,
  target: ImportTarget
): CellRange {
  const full = usedRange(rows, sheet)
  const header = detectHeaderRow(rows, full, target)
  if (header === null) return full

  let endRow = header
  let blankRun = 0
  for (let rowIndex = header + 1; rowIndex <= full.endRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    const cells = row.slice(full.startCol, full.endCol + 1)
    const isTotal = cells.some((cell) => /^(grand\s+)?total\b/i.test(cellText(cell)))
    if (isTotal) break
    if (isBlankRow(cells)) {
      blankRun += 1
      // One blank row can separate two blocks of the same register. Two in a
      // row is the end of the table.
      if (blankRun >= 2) break
      continue
    }
    blankRun = 0
    endRow = rowIndex
  }

  let startCol = full.startCol
  let endCol = full.endCol
  let found = false
  for (let col = full.startCol; col <= full.endCol; col += 1) {
    let hasData = cellText(rows[header]?.[col] ?? null).length > 0
    if (!hasData) {
      for (let rowIndex = header + 1; rowIndex <= endRow; rowIndex += 1) {
        if (cellText(rows[rowIndex]?.[col] ?? null)) {
          hasData = true
          break
        }
      }
    }
    if (hasData) {
      if (!found) {
        startCol = col
        found = true
      }
      endCol = col
    }
  }

  return { sheet, startRow: header, startCol, endRow, endCol }
}

/** The first row and column that hold data, for the initial selection. */
export function usedRange(rows: CellValue[][], sheet: string): CellRange {
  let lastRow = 0
  let lastCol = 0
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (!cellText(cell)) return
      if (rowIndex > lastRow) lastRow = rowIndex
      if (colIndex > lastCol) lastCol = colIndex
    })
  })
  return {
    sheet,
    startRow: 0,
    startCol: 0,
    endRow: lastRow,
    endCol: lastCol
  }
}
