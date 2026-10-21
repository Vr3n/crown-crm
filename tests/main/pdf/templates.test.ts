import { describe, it, expect } from 'vitest'
import { renderInvoiceDocument } from '../../../src/main/pdf/templates/invoice-document'
import { renderPaymentReceipt } from '../../../src/main/pdf/templates/payment-receipt'
import { renderRefundReceipt } from '../../../src/main/pdf/templates/refund-receipt'
import type {
  InvoicePrintContext,
  ReceiptPrintContext,
  RefundPrintContext
} from '../../../src/main/pdf/types'

describe('Invoice Document Template', () => {
  const baseCtx: InvoicePrintContext = {
    org: {
      name: 'Test Gym',
      legalName: 'Test Gym Pvt Ltd',
      logo: null,
      address: '123 Main St, Mumbai',
      gstin: '27AABCU9603R1ZM',
      mobileNumber: '9876543210',
      invoicePrefix: 'GYM'
    },
    invoiceNo: 'GYM-290826-01',
    status: 'PAID',
    issuedAt: '2026-08-29T10:00:00Z',
    dueAt: null,
    customer: {
      name: 'Viren',
      phone: '9876543210',
      email: 'viren@test.com'
    },
    membership: {
      planName: 'Gold Plan',
      joiningDate: '2026-08-29',
      startDate: '2026-08-29',
      endDate: '2027-08-29'
    },
    lines: [
      {
        description: 'Gold Plan (12 months)',
        quantity: 1,
        unitPrice: 2000000,
        taxRate: '18%',
        discountAmount: 0,
        lineTotal: 2000000
      }
    ],
    subtotal: 2000000,
    taxTotal: 360000,
    total: 2360000,
    allocations: [
      {
        paymentNo: 'PAY-0001',
        method: 'CASH',
        amount: 1500000,
        receivedAt: '2026-08-29T10:30:00Z'
      },
      {
        paymentNo: 'PAY-0002',
        method: 'UPI',
        amount: 860000,
        receivedAt: '2026-08-29T11:00:00Z'
      }
    ],
    paidAmount: 2360000,
    refundedAmount: 0,
    refunds: [],
    outstanding: 0,
    generatedAt: '29 Aug 2026, 12:00 PM'
  }

  it('renders valid HTML document', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
  })

  it('includes org name in header', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Test Gym')
  })

  it('skips logo when null', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).not.toContain('<img')
  })

  it('renders logo when provided', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, logo: 'https://example.com/logo.png' }
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('<img')
    expect(html).toContain('header-logo')
    expect(html).toContain('https://example.com/logo.png')
  })

  it('includes invoice number', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('GYM-290826-01')
  })

  it('includes customer name', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Viren')
  })

  it('strips duration from line item description', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Gold Plan')
    expect(html).not.toContain('Gold Plan (12 months)')
  })

  it('shows Discount column header', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Discount')
  })

  it('shows dash when no discount', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('—')
  })

  it('shows discount amount when present', () => {
    const ctx = {
      ...baseCtx,
      lines: [{ ...baseCtx.lines[0], discountAmount: 200000 }]
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('₹2,000.00')
  })

  it('shows tax rate above Tax (GST) in totals', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Tax (GST @ 18%)')
  })

  it('renders allocations table', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('PAY-0001')
    expect(html).toContain('PAY-0002')
    expect(html).toContain('CASH')
    expect(html).toContain('UPI')
  })

  it('shows amounts formatted via formatMinor', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('₹20,000.00')
    expect(html).toContain('₹3,600.00')
    expect(html).toContain('₹23,600.00')
  })

  it('shows outstanding as zero when fully paid', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Outstanding')
    expect(html).toContain('₹0.00')
  })

  it('shows outstanding when partially paid', () => {
    const ctx = {
      ...baseCtx,
      paidAmount: 1500000,
      outstanding: 860000,
      allocations: [baseCtx.allocations[0]]
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('₹8,600.00')
  })

  it('shows no-payments message when allocations empty', () => {
    const ctx = {
      ...baseCtx,
      allocations: [],
      paidAmount: 0,
      outstanding: 2360000
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('No payments recorded')
  })

  it('includes GSTIN when provided', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('GSTIN: 27AABCU9603R1ZM')
  })

  it('excludes GSTIN when not provided', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, gstin: null }
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).not.toContain('GSTIN')
  })

  it('includes footer with generation timestamp', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Generated by CrownCRM')
    expect(html).toContain('29 Aug 2026, 12:00 PM')
  })

  it('includes accent bar', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('accent-bar')
    expect(html).toContain('linear-gradient')
  })

  it('includes grand total in dark box', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('totals-row grand')
    expect(html).toContain('#111827')
  })

  it('does not include billing snapshot section', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).not.toContain('Billing Snapshot')
  })

  it('shows membership duration section when membership present', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('Membership Duration')
    expect(html).toContain('Joining Date')
    expect(html).toContain('Start Date')
    expect(html).toContain('End Date')
  })

  it('formats membership dates correctly', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).toContain('29 Aug 2026')
    expect(html).toContain('29 Aug 2027')
  })

  it('hides membership section when no membership', () => {
    const ctx = {
      ...baseCtx,
      membership: null
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).not.toContain('Membership Duration')
  })

  it('shows discount in totals when discount > 0', () => {
    const ctx = {
      ...baseCtx,
      lines: [{ ...baseCtx.lines[0], discountAmount: 200000 }],
      subtotal: 2000000,
      total: 2160000
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('Discount')
    expect(html).toContain('− ₹2,000.00')
  })

  it('renders refunds section and Net Paid when refunds present', () => {
    const ctx = {
      ...baseCtx,
      refunds: [
        {
          refundNo: 'REF-0001',
          refundDate: '2026-08-30T10:00:00Z',
          method: 'UPI',
          reason: 'Membership cancellation',
          amount: 500000
        }
      ],
      refundedAmount: 500000
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('Refunds Issued')
    expect(html).toContain('REF-0001')
    expect(html).toContain('Membership cancellation')
    expect(html).toContain('Net Paid')
    expect(html).toContain('₹18,600.00')
  })

  it('hides refunds section when no refunds', () => {
    const html = renderInvoiceDocument(baseCtx)
    expect(html).not.toContain('Refunds Issued')
  })

  it('renders invoice terms block when terms are set', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, invoiceTerms: 'All dues must be cleared before renewal.' }
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('Terms &amp; Conditions')
    expect(html).toContain('All dues must be cleared before renewal.')
  })

  it('omits terms block when terms are null', () => {
    const html = renderInvoiceDocument({ ...baseCtx, org: { ...baseCtx.org, invoiceTerms: null } })
    expect(html).not.toContain('Terms &amp; Conditions')
  })

  it('escapes HTML and preserves line breaks in terms', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, invoiceTerms: 'No <b>bold</b> allowed.\nLine two.' }
    }
    const html = renderInvoiceDocument(ctx)
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('Line two.')
    expect(html).toContain('<br />')
  })

  it('shows Finalized By only when a finalizer is set', () => {
    const plain = renderInvoiceDocument(baseCtx)
    expect(plain).not.toContain('Finalized By')

    const html = renderInvoiceDocument({ ...baseCtx, finalizedBy: 'Viren (Owner)' })
    expect(html).toContain('Finalized By')
    expect(html).toContain('Viren (Owner)')
  })
})

describe('Refund Receipt Template', () => {
  const baseCtx: RefundPrintContext = {
    org: {
      name: 'Test Gym',
      logo: null,
      address: '123 Main St, Mumbai',
      gstin: null,
      mobileNumber: '9876543210'
    },
    refundNo: 'REF-0001',
    refundDate: '2026-09-08',
    amount: 500000,
    method: 'UPI',
    sourcePaymentNo: 'PAY-0001',
    invoiceNumbers: ['GYM-290826-01'],
    customer: {
      name: 'Viren',
      phone: '9876543210',
      email: null
    },
    membershipName: 'Gold Plan',
    reason: 'Membership cancellation',
    recordedBy: 'John',
    generatedAt: '08 Sep 2026, 12:00 PM'
  }

  it('renders valid HTML document', () => {
    const html = renderRefundReceipt(baseCtx)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
  })

  it('includes refund number and refunded amount', () => {
    const html = renderRefundReceipt(baseCtx)
    expect(html).toContain('REF-0001')
    expect(html).toContain('Refund Issued')
    expect(html).toContain('− ₹5,000.00')
  })

  it('includes customer name and covered invoice', () => {
    const html = renderRefundReceipt(baseCtx)
    expect(html).toContain('Viren')
    expect(html).toContain('GYM-290826-01')
    expect(html).toContain('PAY-0001')
  })

  it('includes reason and recorded by', () => {
    const html = renderRefundReceipt(baseCtx)
    expect(html).toContain('Membership cancellation')
    expect(html).toContain('John')
  })

  it('shows no-invoice note when no invoices covered', () => {
    const ctx = { ...baseCtx, invoiceNumbers: [] }
    const html = renderRefundReceipt(ctx)
    expect(html).toContain('not allocated')
  })

  it('renders refund terms block when terms are set', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, refundTerms: 'Refunds reach your account within 5 working days.' }
    }
    const html = renderRefundReceipt(ctx)
    expect(html).toContain('Terms &amp; Conditions')
    expect(html).toContain('Refunds reach your account within 5 working days.')
  })

  it('omits refund terms block when terms are null', () => {
    const html = renderRefundReceipt({ ...baseCtx, org: { ...baseCtx.org, refundTerms: null } })
    expect(html).not.toContain('Terms &amp; Conditions')
  })
})

describe('Payment Receipt Template', () => {
  const baseCtx: ReceiptPrintContext = {
    org: {
      name: 'Test Gym',
      logo: null,
      address: '123 Main St, Mumbai',
      gstin: null,
      mobileNumber: '9876543210'
    },
    paymentNo: 'PAY-0001',
    paymentDate: '2026-08-29',
    amount: 1500000,
    method: 'CASH',
    reference: null,
    customer: {
      name: 'Viren',
      phone: '9876543210',
      email: null
    },
    membershipName: 'Gold Plan',
    allocations: [{ invoiceNo: 'GYM-290826-01', amount: 1500000 }],
    outstanding: 860000,
    receivedBy: 'John',
    generatedAt: '29 Aug 2026, 12:00 PM'
  }

  it('renders valid HTML document', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
  })

  it('includes payment number', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('PAY-0001')
  })

  it('includes customer name', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Viren')
  })

  it('shows amount formatted via formatMinor', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('₹15,000.00')
  })

  it('includes payment method', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Cash')
  })

  it('renders allocation to invoice', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('GYM-290826-01')
  })

  it('shows membership name below customer info', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Gold Plan')
    expect(html).toContain('color: #2563EB')
  })

  it('hides membership name when not provided', () => {
    const ctx = {
      ...baseCtx,
      membershipName: null
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).not.toContain('Gold Plan')
  })

  it('shows outstanding below total allocated', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Outstanding')
    expect(html).toContain('₹8,600.00')
    expect(html).toContain('#991B1B')
  })

  it('shows zero outstanding when fully allocated', () => {
    const ctx = {
      ...baseCtx,
      outstanding: 0
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).toContain('Outstanding')
    expect(html).toContain('₹0.00')
    expect(html).toContain('#6B7280')
  })

  it('shows unallocated notice when no allocations', () => {
    const ctx = {
      ...baseCtx,
      allocations: []
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).toContain('not been allocated')
    expect(html).toContain('⚠')
  })

  it('hides allocations table when unallocated', () => {
    const ctx = {
      ...baseCtx,
      allocations: []
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).not.toContain('<table>')
  })

  it('includes received by name', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('John')
  })

  it('includes footer', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Generated by CrownCRM')
  })

  it('includes org address when provided', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('123 Main St, Mumbai')
  })

  it('excludes org address when not provided', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, address: null }
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).not.toContain('123 Main St')
  })

  it('includes payment hero card', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('Payment Received')
    expect(html).toContain('background: #ECFDF5')
  })

  it('includes accent bar', () => {
    const html = renderPaymentReceipt(baseCtx)
    expect(html).toContain('accent-bar')
  })

  it('renders receipt terms block when terms are set', () => {
    const ctx = {
      ...baseCtx,
      org: { ...baseCtx.org, receiptTerms: 'This receipt confirms your payment.' }
    }
    const html = renderPaymentReceipt(ctx)
    expect(html).toContain('Terms &amp; Conditions')
    expect(html).toContain('This receipt confirms your payment.')
  })

  it('omits receipt terms block when terms are null', () => {
    const html = renderPaymentReceipt({ ...baseCtx, org: { ...baseCtx.org, receiptTerms: null } })
    expect(html).not.toContain('Terms &amp; Conditions')
  })
})
