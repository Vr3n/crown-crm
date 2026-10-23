/**
 * Export helpers. CSV is generated in the renderer; PDF is produced by the
 * Electron main process from the current window, so the print stylesheet (which
 * hides the rail and toolbar) decides what lands on the page.
 */

function escapeCell(cell: string): string {
  const value = cell.replace(/\u00a0/g, ' ')
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(head: string[], rows: string[][]): string {
  return [head, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, head: string[], rows: string[][]): void {
  // The BOM keeps Excel from mangling the rupee sign and Indian names.
  const blob = new Blob([`\ufeff${toCsv(head, rows)}`], {
    type: 'text/csv;charset=utf-8;'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
