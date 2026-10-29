import type { InvoiceDocument } from '../../shared/contracts/invoice'

/**
 * Builds the default filename for an exported invoice:
 *
 *   <party-name>_<Sales|Purchase>_<invoice-number>_<yyyyMMdd-HHmmss>.pdf
 *   Acme-Distributors_Sales_INV-0001_20261029-153012.pdf
 *
 * The timestamp is local time because the person saving the file reads their
 * own clock. Every segment is sanitised for Windows (reserved characters,
 * control characters, trailing dots and spaces) and capped so the full path
 * stays well inside the 260 character limit.
 */

const RESERVED_CHARS = /[<>:"/\\|?*]/g
const ILLEGAL_RUNS = /[^A-Za-z0-9._-]+/g
const REPEATED_DASHES = /-{2,}/g
const MAX_SEGMENT = 60
const MAX_FILENAME = 150

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/** Control characters cannot appear in a Windows filename; drop them. */
function withoutControlChars(value: string): string {
  return [...value].filter((char) => char.charCodeAt(0) > 0x1f).join('')
}

/** "INV/0001" -> "INV-0001"; keeps dots, underscores and hyphens. */
export function sanitizeFilenameSegment(value: string): string {
  return withoutControlChars(value)
    .replace(RESERVED_CHARS, '-')
    .replace(ILLEGAL_RUNS, '-')
    .replace(REPEATED_DASHES, '-')
    .replace(/^[-._\s]+|[-._\s]+$/g, '')
    .slice(0, MAX_SEGMENT)
    .replace(/[-._\s]+$/g, '')
}

/** Local time, second resolution, sortable: 20261029-153012. */
export function invoiceTimestamp(at: Date): string {
  return (
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  )
}

export interface InvoiceFilenameInput {
  partyName: string | null | undefined
  type: InvoiceDocument['type']
  number: string
  at: Date
}

export function buildInvoiceFilename(input: InvoiceFilenameInput): string {
  const party = sanitizeFilenameSegment(input.partyName ?? '') || 'Party'
  const type = input.type === 'SALES' ? 'Sales' : 'Purchase'
  const number = sanitizeFilenameSegment(input.number) || 'Invoice'
  const stamp = invoiceTimestamp(input.at)

  const name = `${party}_${type}_${number}_${stamp}`
  return `${name.slice(0, MAX_FILENAME)}.pdf`
}
