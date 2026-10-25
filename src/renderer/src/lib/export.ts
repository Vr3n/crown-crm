/**
 * Export helpers. CSV is generated in the renderer; PDF is produced by the
 * Electron main process from the current window, so the print stylesheet (which
 * hides the rail and toolbar) decides what lands on the page. Both are saved by
 * the main process so it can reveal the file in the folder afterwards.
 */

import type { ExportResult } from '../../../shared/contracts/export'

function escapeCell(cell: string): string {
  const value = cell.replace(/\u00a0/g, ' ')
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(head: string[], rows: string[][]): string {
  return [head, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/**
 * Hands the CSV to the main process, which shows a save dialog, writes the file
 * and reveals it. The BOM keeps Excel from mangling the rupee sign and Indian
 * names.
 */
export async function downloadCsv(
  filename: string,
  head: string[],
  rows: string[][]
): Promise<ExportResult> {
  return window.api.exportCsv({ filename, csv: `\ufeff${toCsv(head, rows)}` })
}

export function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
