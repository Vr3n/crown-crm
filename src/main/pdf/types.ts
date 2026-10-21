/** Org branding data for PDF headers. */
export interface OrgBranding {
  name: string
  legalName?: string | null
  logo?: string | null
  address?: string | null
  gstin?: string | null
  mobileNumber: string
  invoicePrefix?: string | null
  /** Organization timezone — `generatedAt` is rendered in it. */
  timezone?: string | null
  /** Terms & Conditions printed on Invoice Document footers. */
  invoiceTerms?: string | null
  /** Terms & Conditions printed on Payment Receipt footers. */
  receiptTerms?: string | null
  /** Terms & Conditions printed on Refund Receipt footers. */
  refundTerms?: string | null
}

/** Customer/billing snapshot for PDF documents. */
export interface PdfCustomer {
  name: string
  phone?: string | null
  email?: string | null
}

/** Invoice line item for PDF rendering. */
export interface PdfInvoiceLine {
  description: string
  quantity: number
  unitPrice: number
  taxRate: string
  discountAmount: number
  lineTotal: number
}

/** Payment allocation shown on invoice PDF. */
export interface PdfAllocation {
  paymentNo: string
  method: string
  amount: number
  receivedAt: string
}

/** Full print context for Invoice Document PDF. */
export interface InvoicePrintContext {
  org: OrgBranding
  invoiceNo: string
  status: string
  issuedAt: string
  dueAt?: string | null
  customer: PdfCustomer
  /** Membership duration info — shown above Payments Received. */
  membership?: {
    planName: string
    joiningDate: string
    startDate: string
    endDate: string
  } | null
  lines: PdfInvoiceLine[]
  subtotal: number
  taxTotal: number
  total: number
  allocations: PdfAllocation[]
  /** Refunds issued against payments allocated to this invoice. */
  refunds: PdfRefund[]
  paidAmount: number
  /** Total refunded against this invoice (net = paid − refunded). */
  refundedAmount: number
  outstanding: number
  /**
   * User who finalized the invoice, rendered as "Full Name (Role)". Null for a
   * DRAFT preview — no Finalized By line is shown until the invoice is finalized.
   */
  finalizedBy?: string | null
  generatedAt: string
}

/** Full print context for Payment Receipt PDF. */
export interface ReceiptPrintContext {
  org: OrgBranding
  paymentNo: string
  paymentDate: string
  amount: number
  method: string
  reference?: string | null
  customer: PdfCustomer
  /** Active membership name for this customer. */
  membershipName?: string | null
  allocations: Array<{
    invoiceNo: string
    amount: number
  }>
  /** Total outstanding across allocated invoices after this payment. */
  outstanding: number
  receivedBy: string
  generatedAt: string
}

/** One refund row shown on an invoice PDF (linked via the source payment). */
export interface PdfRefund {
  refundNo: string
  refundDate: string
  method: string
  reason: string
  amount: number
}

/** Full print context for Refund Receipt PDF. */
export interface RefundPrintContext {
  org: OrgBranding
  refundNo: string
  refundDate: string
  amount: number
  method: string
  sourcePaymentNo: string
  /** Invoice numbers the source payment was allocated to. */
  invoiceNumbers: string[]
  customer: PdfCustomer
  /** Active membership name for this customer. */
  membershipName?: string | null
  reason: string
  recordedBy: string
  generatedAt: string
}

export type PdfDocumentType = 'invoice' | 'receipt' | 'refund'
