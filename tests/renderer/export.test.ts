import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, safeFilename, toCsv } from '@/lib/export'

type ApiWindow = Window & {
  api?: { exportCsv: (input: { filename: string; csv: string }) => Promise<unknown> }
}

function stubApi(exportCsv: (input: { filename: string; csv: string }) => Promise<unknown>): void {
  ;(window as ApiWindow).api = { exportCsv }
}

afterEach(() => {
  delete (window as ApiWindow).api
})

describe('toCsv', () => {
  it('joins header and rows with CRLF', () => {
    expect(toCsv(['A', 'B'], [['1', '2']])).toBe('A,B\r\n1,2')
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    expect(toCsv(['Name'], [['Sharma, Traders'], ['He said "hi"'], ['two\nlines']])).toBe(
      'Name\r\n"Sharma, Traders"\r\n"He said ""hi"""\r\n"two\nlines"'
    )
  })

  it('normalises non-breaking spaces', () => {
    expect(toCsv(['Value'], [['1\u00a0000']])).toBe('Value\r\n1 000')
  })
})

describe('downloadCsv', () => {
  it('sends the BOM-prefixed csv to the main process', async () => {
    const exportCsv = vi.fn().mockResolvedValue({ saved: true, filePath: 'C:/sales.csv' })
    stubApi(exportCsv)

    const result = await downloadCsv('sales-register', ['Date', 'Total'], [['2026-04-01', '10.00']])

    expect(exportCsv).toHaveBeenCalledWith({
      filename: 'sales-register',
      csv: '\ufeffDate,Total\r\n2026-04-01,10.00'
    })
    expect(result).toEqual({ saved: true, filePath: 'C:/sales.csv' })
  })

  it('lets a save failure reach the caller', async () => {
    stubApi(vi.fn().mockRejectedValue(new Error('disk full')))
    await expect(downloadCsv('sales', ['A'], [['1']])).rejects.toThrow('disk full')
  })
})

describe('safeFilename', () => {
  it('makes a lowercase slug', () => {
    expect(safeFilename('Sales Register — April 2026')).toBe('sales-register-april-2026')
  })
})
