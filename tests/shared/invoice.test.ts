import { describe, expect, it } from 'vitest'
import {
  buildTaxSlabs,
  formatInvoiceAmount,
  formatInvoiceDate,
  formatInvoicePercent,
  formatInvoiceQty,
  groupIndian,
  invoiceDocumentTitle,
  invoiceNumberLabel,
  invoicePartyLabel,
  invoiceTermLines,
  isInterStateInvoice
} from '../../src/shared/invoice'
import { stateLabel } from '../../src/shared/indian-states'
import type { InvoiceDocument, InvoiceLine } from '../../src/shared/contracts/invoice'

function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    id: 1,
    description: 'SSD 256GB',
    hsn: '8471',
    uom: 'NOS',
    qtyE4: 10_000,
    rateMinor: 100_000,
    discountBps: 0,
    gstRateBps: 1800,
    taxableMinor: 100_000,
    cgstMinor: 9_000,
    sgstMinor: 9_000,
    igstMinor: 0,
    cessMinor: 0,
    totalMinor: 118_000,
    ...overrides
  }
}

describe('groupIndian', () => {
  it('groups digits the Indian way', () => {
    expect(groupIndian('123')).toBe('123')
    expect(groupIndian('1000')).toBe('1,000')
    expect(groupIndian('1234567')).toBe('12,34,567')
    expect(groupIndian('0001234567')).toBe('12,34,567')
  })
})

describe('formatInvoiceAmount', () => {
  it('always prints two decimals without a currency symbol', () => {
    expect(formatInvoiceAmount(0)).toBe('0.00')
    expect(formatInvoiceAmount(100)).toBe('1.00')
    expect(formatInvoiceAmount(1_554_500)).toBe('15,545.00')
    expect(formatInvoiceAmount(123_456_789)).toBe('12,34,567.89')
    expect(formatInvoiceAmount(-1_200)).toBe('-12.00')
  })
})

describe('formatInvoiceQty', () => {
  it('drops trailing zeroes but keeps up to four decimals', () => {
    expect(formatInvoiceQty(10_000)).toBe('1')
    expect(formatInvoiceQty(25_000)).toBe('2.5')
    expect(formatInvoiceQty(1)).toBe('0.0001')
    expect(formatInvoiceQty(123_450_000)).toBe('12,345')
  })
})

describe('formatInvoicePercent', () => {
  it('prints basis points as a trimmed percentage', () => {
    expect(formatInvoicePercent(0)).toBe('0%')
    expect(formatInvoicePercent(1800)).toBe('18%')
    expect(formatInvoicePercent(250)).toBe('2.5%')
    expect(formatInvoicePercent(1250)).toBe('12.5%')
  })
})

describe('formatInvoiceDate', () => {
  it('formats an ISO date without the host locale', () => {
    expect(formatInvoiceDate('2026-10-29')).toBe('29 Oct 2026')
    expect(formatInvoiceDate(null)).toBe('')
    expect(formatInvoiceDate('not-a-date')).toBe('not-a-date')
  })
})

describe('buildTaxSlabs', () => {
  it('groups lines by GST rate, sums each head and sorts by rate', () => {
    const slabs = buildTaxSlabs([
      line({ id: 1, gstRateBps: 1800 }),
      line({ id: 2, gstRateBps: 1800, taxableMinor: 50_000, cgstMinor: 4_500, sgstMinor: 4_500 }),
      line({
        id: 3,
        gstRateBps: 1200,
        taxableMinor: 20_000,
        cgstMinor: 1_200,
        sgstMinor: 1_200
      })
    ])

    expect(slabs.map((slab) => slab.gstRateBps)).toEqual([1200, 1800])
    expect(slabs[0]).toMatchObject({ taxableMinor: 20_000, taxMinor: 2_400 })
    expect(slabs[1]).toMatchObject({
      taxableMinor: 150_000,
      cgstMinor: 13_500,
      sgstMinor: 13_500,
      taxMinor: 27_000
    })
  })

  it('drops a line with no rate and no value', () => {
    const slabs = buildTaxSlabs([
      line({ gstRateBps: 0, taxableMinor: 0, cgstMinor: 0, sgstMinor: 0, totalMinor: 0 })
    ])
    expect(slabs).toEqual([])
  })
})

describe('invoice labels', () => {
  it('calls a sale a tax invoice and a purchase a purchase bill', () => {
    expect(invoiceDocumentTitle('SALES')).toBe('TAX INVOICE')
    expect(invoiceDocumentTitle('PURCHASE')).toBe('PURCHASE BILL')
    expect(invoicePartyLabel('SALES')).toBe('Bill To')
    expect(invoicePartyLabel('PURCHASE')).toBe('Supplier')
    expect(invoiceNumberLabel('SALES')).toBe('Invoice No.')
    expect(invoiceNumberLabel('PURCHASE')).toBe('Supplier Bill No.')
  })

  it('splits stored terms into readable lines', () => {
    expect(invoiceTermLines('1. First\r\n\r\n2. Second \n')).toEqual(['1. First', '2. Second'])
    expect(invoiceTermLines(null)).toEqual([])
  })
})

describe('isInterStateInvoice', () => {
  const document = {
    lines: [line({ igstMinor: 18_000, cgstMinor: 0, sgstMinor: 0 })]
  } as unknown as InvoiceDocument

  it('is true when any line carries IGST', () => {
    expect(isInterStateInvoice(document)).toBe(true)
    expect(isInterStateInvoice({ lines: [line()] } as unknown as InvoiceDocument)).toBe(false)
  })
})

describe('stateLabel', () => {
  it('names a known code and keeps an unknown one', () => {
    expect(stateLabel('27')).toBe('Maharashtra (27)')
    expect(stateLabel('81')).toBe('81')
    expect(stateLabel(null)).toBeNull()
  })
})
