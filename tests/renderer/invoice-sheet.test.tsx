import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { InvoiceSheet } from '@/features/invoice/components/InvoiceSheet'
import { INVOICE_COPY_CAPTIONS } from '../../src/shared/contracts/invoice'
import type { InvoiceDocument } from '../../src/shared/contracts/invoice'

function salesDocument(overrides: Partial<InvoiceDocument> = {}): InvoiceDocument {
  return {
    id: 7,
    type: 'SALES',
    number: 'INV/0001',
    date: '2026-10-29',
    dueDate: '2026-11-28',
    referenceNo: 'PO-42',
    narration: null,
    placeOfSupplyStateCode: '27',
    status: 'POSTED',
    company: {
      name: 'Acme Distributors',
      legalName: null,
      gstin: '27AABFU4477G1ZY',
      pan: 'AABFU4477G',
      stateCode: '27',
      address: '12 Market Road',
      city: 'Pune',
      pincode: '411001',
      phone: '9876543210',
      email: 'owner@acme.in',
      currency: 'INR',
      invoiceTerms: '1. Goods once sold are not taken back.\n2. Report discrepancies in 7 days.',
      logo: null
    },
    party: {
      id: 3,
      name: 'Acme Distributor',
      gstin: '27AABFU4477G1ZY',
      pan: null,
      stateCode: '27',
      billingAddress: '88 Buyer Street, Pune',
      shippingAddress: null,
      phone: '9000000001',
      email: null
    },
    lines: [
      {
        id: 1,
        description: 'SSD 256GB',
        hsn: '8471',
        uom: 'NOS',
        qtyE4: 10_000,
        rateMinor: 1_000_000,
        discountBps: 0,
        gstRateBps: 1800,
        taxableMinor: 1_000_000,
        cgstMinor: 90_000,
        sgstMinor: 90_000,
        igstMinor: 0,
        cessMinor: 0,
        totalMinor: 1_180_000
      }
    ],
    taxSlabs: [
      {
        gstRateBps: 1800,
        taxableMinor: 1_000_000,
        cgstMinor: 90_000,
        sgstMinor: 90_000,
        igstMinor: 0,
        cessMinor: 0,
        taxMinor: 180_000
      }
    ],
    bank: null,
    totals: {
      taxableMinor: 1_000_000,
      cgstMinor: 90_000,
      sgstMinor: 90_000,
      igstMinor: 0,
      cessMinor: 0,
      discountMinor: 0,
      roundOffMinor: 0,
      totalMinor: 1_180_000,
      totalQtyE4: 10_000
    },
    ...overrides
  }
}

describe('InvoiceSheet', () => {
  it('prints both GST copy captions', () => {
    const document = salesDocument()
    render(
      <>
        {INVOICE_COPY_CAPTIONS.map((caption, index) => (
          <InvoiceSheet
            key={caption}
            document={document}
            caption={caption}
            page={index + 1}
            pages={INVOICE_COPY_CAPTIONS.length}
          />
        ))}
      </>
    )

    expect(screen.getAllByText('ORIGINAL FOR RECIPIENT').length).toBeGreaterThan(0)
    expect(screen.getAllByText('DUPLICATE FOR TRANSPORTER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Page 1 of 2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Page 2 of 2').length).toBeGreaterThan(0)
  })

  it('renders the company, party, line grid and totals', () => {
    render(
      <InvoiceSheet
        document={salesDocument()}
        caption="ORIGINAL FOR RECIPIENT"
        page={1}
        pages={2}
      />
    )

    expect(screen.getAllByText('Acme Distributors').length).toBeGreaterThan(0)
    expect(screen.getByText('TAX INVOICE')).toBeInTheDocument()
    expect(screen.getByText('INV/0001')).toBeInTheDocument()
    expect(screen.getByText('Bill To')).toBeInTheDocument()
    expect(screen.getAllByText('Acme Distributor').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GSTIN 27AABFU4477G1ZY/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maharashtra (27)').length).toBeGreaterThan(0)
    expect(screen.getByText('SSD 256GB')).toBeInTheDocument()
    expect(screen.getByText('8471')).toBeInTheDocument()
    expect(screen.getByText('Grand Total')).toBeInTheDocument()
    expect(screen.getAllByText('11,800.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Rupees Eleven Thousand Eight Hundred Only')).toBeInTheDocument()
    expect(screen.getByText('Rate-wise Tax Summary')).toBeInTheDocument()
    expect(screen.getByText('Authorised Signatory')).toBeInTheDocument()
    expect(screen.getByText(/Subject to Pune jurisdiction/i)).toBeInTheDocument()
    expect(screen.getByText('1. Goods once sold are not taken back.')).toBeInTheDocument()
  })

  it('uses purchase wording and the supplier block for a purchase bill', () => {
    const document = salesDocument({ type: 'PURCHASE', number: 'PUR/0001' })
    render(<InvoiceSheet document={document} caption="ORIGINAL FOR RECIPIENT" page={1} pages={2} />)

    expect(screen.getByText('PURCHASE BILL')).toBeInTheDocument()
    expect(screen.getByText('Supplier Bill No.')).toBeInTheDocument()
    expect(screen.getByText('Supplier')).toBeInTheDocument()
  })

  it('renders the company logo when the profile has one', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo='
    const { container } = render(
      <InvoiceSheet
        document={salesDocument({
          company: { ...salesDocument().company, logo }
        })}
        caption="ORIGINAL FOR RECIPIENT"
        page={1}
        pages={2}
      />
    )

    const image = container.querySelector('img.invoice-logo')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe(logo)
    // Decorative: the company name is printed next to it.
    expect(image?.getAttribute('alt')).toBe('')
  })

  it('omits the logo element when the profile has none', () => {
    const { container } = render(
      <InvoiceSheet
        document={salesDocument()}
        caption="ORIGINAL FOR RECIPIENT"
        page={1}
        pages={2}
      />
    )

    expect(container.querySelector('img.invoice-logo')).toBeNull()
  })

  it('shows a cancellation watermark when the voucher was cancelled', () => {
    const { container } = render(
      <InvoiceSheet
        document={salesDocument({ status: 'CANCELLED' })}
        caption="DUPLICATE FOR TRANSPORTER"
        page={2}
        pages={2}
      />
    )

    const sheet = container.querySelector('article')
    expect(sheet).not.toBeNull()
    expect(within(sheet as HTMLElement).getByText('CANCELLED')).toBeInTheDocument()
  })
})
