import { describe, expect, it } from 'vitest'
import {
  buildInvoiceFilename,
  invoiceTimestamp,
  sanitizeFilenameSegment
} from '../../../src/main/export/invoice-filename'

describe('invoiceTimestamp', () => {
  it('formats local time with second resolution and zero padding', () => {
    expect(invoiceTimestamp(new Date(2026, 0, 5, 4, 3, 2))).toBe('20260105-040302')
    expect(invoiceTimestamp(new Date(2026, 9, 29, 15, 30, 12))).toBe('20261029-153012')
  })
})

describe('sanitizeFilenameSegment', () => {
  it('turns Windows-reserved characters into a single dash', () => {
    expect(sanitizeFilenameSegment('INV/0001')).toBe('INV-0001')
    expect(sanitizeFilenameSegment('a<b>c:d"e\\f|g?h*i')).toBe('a-b-c-d-e-f-g-h-i')
  })

  it('collapses runs and trims dots, dashes and spaces from the edges', () => {
    expect(sanitizeFilenameSegment('  Acme & Co.  ')).toBe('Acme-Co')
    expect(sanitizeFilenameSegment('..')).toBe('')
  })

  it('drops control characters instead of leaving a dash', () => {
    expect(sanitizeFilenameSegment('In\u0000voice\u001f1')).toBe('Invoice1')
  })

  it('caps a segment at 60 characters', () => {
    expect(sanitizeFilenameSegment('x'.repeat(100))).toHaveLength(60)
  })
})

describe('buildInvoiceFilename', () => {
  const at = new Date(2026, 9, 29, 15, 30, 12)

  it('builds the documented sales filename', () => {
    expect(
      buildInvoiceFilename({
        partyName: 'Acme-Distributors',
        type: 'SALES',
        number: 'INV-0001',
        at
      })
    ).toBe('Acme-Distributors_Sales_INV-0001_20261029-153012.pdf')
  })

  it('sanitises the voucher number and labels a purchase', () => {
    expect(
      buildInvoiceFilename({
        partyName: 'TechConnect',
        type: 'PURCHASE',
        number: 'PUR/0001',
        at
      })
    ).toBe('TechConnect_Purchase_PUR-0001_20261029-153012.pdf')
  })

  it('falls back to Party and Invoice when the data is missing', () => {
    expect(buildInvoiceFilename({ partyName: null, type: 'SALES', number: '', at })).toBe(
      'Party_Sales_Invoice_20261029-153012.pdf'
    )
  })

  it('keeps the whole name inside a safe path length', () => {
    const name = buildInvoiceFilename({
      partyName: 'A'.repeat(200),
      type: 'SALES',
      number: 'B'.repeat(200),
      at
    })
    expect(name.endsWith('.pdf')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(154)
  })
})
