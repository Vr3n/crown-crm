import { describe, expect, it } from 'vitest'
import { safeFilename, toCsv } from '@/lib/export'

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

describe('safeFilename', () => {
  it('makes a lowercase slug', () => {
    expect(safeFilename('Sales Register — April 2026')).toBe('sales-register-april-2026')
  })
})
