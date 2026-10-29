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
    bank: { name: 'HDFC Bank', code: 'BANK-01' },
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

function purchaseDocument(overrides: Partial<InvoiceDocument> = {}): InvoiceDocument {
  return salesDocument({
    type: 'PURCHASE',
    number: 'PUR/0001',
    referenceNo: 'TC/2026-27/583',
    narration: 'Office supplies',
    ...overrides
  })
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
    expect(screen.getAllByText(/Page 1 of 2/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Page 2 of 2/).length).toBeGreaterThan(0)
  })

  it('renders the sample bill content for a sales invoice', () => {
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
    expect(screen.getByText('Invoice No.')).toBeInTheDocument()
    expect(screen.getByText('INV/0001')).toBeInTheDocument()
    expect(screen.getByText('Buyer (Bill to)')).toBeInTheDocument()
    expect(screen.getAllByText('Acme Distributor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('88 Buyer Street, Pune').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/GSTIN\/UIN: 27AABFU4477G1ZY/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Maharashtra (27)').length).toBeGreaterThan(0)

    expect(screen.getByText('Delivery Note')).toBeInTheDocument()
    expect(screen.getByText('Mode of Payment')).toBeInTheDocument()
    expect(screen.getByText("Supplier's Ref.")).toBeInTheDocument()
    expect(screen.getByText('Due 28 Nov 2026')).toBeInTheDocument()

    expect(screen.getByText('Description of Goods')).toBeInTheDocument()
    expect(screen.getAllByText('HSN/SAC').length).toBeGreaterThan(0)
    expect(screen.getByText('Quantity')).toBeInTheDocument()
    expect(screen.getByText('Disc. %')).toBeInTheDocument()
    expect(screen.getByText('SSD 256GB')).toBeInTheDocument()
    expect(screen.getAllByText('8471').length).toBeGreaterThan(0)

    expect(screen.getAllByText('Taxable Value').length).toBeGreaterThan(0)
    expect(screen.getByText('CGST @ 9%')).toBeInTheDocument()
    expect(screen.getByText('SGST @ 9%')).toBeInTheDocument()
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/11,800\.00/).length).toBeGreaterThan(0)
    expect(screen.getByText('Rupees Eleven Thousand Eight Hundred Only')).toBeInTheDocument()
    expect(screen.getByText('Rupees One Thousand Eight Hundred Only')).toBeInTheDocument()

    expect(screen.getByText('HSN/SAC-wise Tax Summary')).toBeInTheDocument()
    expect(screen.getByText('HDFC Bank')).toBeInTheDocument()
    expect(screen.getByText('Declaration')).toBeInTheDocument()
    expect(screen.getByText('Authorised Signatory')).toBeInTheDocument()
    expect(screen.getByText(/Subject to Pune jurisdiction/i)).toBeInTheDocument()
    expect(screen.getByText('This is a Computer Generated Invoice')).toBeInTheDocument()
    expect(screen.getByText('1. Goods once sold are not taken back.')).toBeInTheDocument()
  })

  it('reproduces the supplier invoice and our company as buyer for a purchase', () => {
    render(
      <InvoiceSheet
        document={purchaseDocument()}
        caption="ORIGINAL FOR RECIPIENT"
        page={1}
        pages={2}
      />
    )

    expect(screen.getByText('TAX INVOICE')).toBeInTheDocument()
    expect(screen.getByText('Supplier Bill No.')).toBeInTheDocument()
    expect(screen.getByText('TC/2026-27/583')).toBeInTheDocument()
    expect(screen.getByText('Our Voucher No.')).toBeInTheDocument()
    expect(screen.getByText('PUR/0001')).toBeInTheDocument()
    expect(screen.getByText('Place of Supply')).toBeInTheDocument()
    expect(screen.getByText('Reference No. & Date')).toBeInTheDocument()
    expect(screen.getByText('Office supplies')).toBeInTheDocument()

    // The supplier's shorter Tally grid has no transport rows.
    expect(screen.queryByText('Despatched Through')).toBeNull()
    expect(screen.queryByText('Delivery Note')).toBeNull()

    // The supplier is the issuer and our company is the buyer.
    expect(screen.getAllByText('Acme Distributor').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Acme Distributors').length).toBeGreaterThan(0)
    expect(screen.getByText("Customer's Seal and Signature")).toBeInTheDocument()

    // Supplier terms and bank details are not in our books, so they stay out.
    expect(screen.queryByText('Terms & Conditions')).toBeNull()
    expect(screen.queryByText('HDFC Bank')).toBeNull()
  })

  it('renders the company logo on a sale when the profile has one', () => {
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

  it('does not put our logo on the supplier letterhead of a purchase', () => {
    const logo = 'data:image/png;base64,iVBORw0KGgo='
    const { container } = render(
      <InvoiceSheet
        document={purchaseDocument({
          company: { ...purchaseDocument().company, logo }
        })}
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
