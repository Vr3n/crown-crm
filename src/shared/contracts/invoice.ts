import { z } from 'zod'

/**
 * Read model for the printable sales invoice / purchase bill. It is
 * deliberately separate from `VoucherDetail`: a tax invoice needs the company
 * block, the party address and GSTIN, the place of supply, per-line CGST, SGST
 * and IGST, and the bank account — none of which the detail screen carries.
 */

export const invoiceVoucherIdSchema = z.object({ id: z.number().int().positive() })

export interface InvoiceCompany {
  name: string
  legalName: string | null
  gstin: string | null
  pan: string | null
  stateCode: string
  address: string | null
  city: string | null
  pincode: string | null
  phone: string | null
  email: string | null
  currency: string
  invoiceTerms: string | null
}

export interface InvoiceParty {
  id: number
  name: string
  gstin: string | null
  pan: string | null
  stateCode: string | null
  billingAddress: string | null
  shippingAddress: string | null
  phone: string | null
  email: string | null
}

export interface InvoiceLine {
  id: number
  description: string
  hsn: string | null
  uom: string | null
  qtyE4: number
  rateMinor: number
  discountBps: number
  gstRateBps: number
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  totalMinor: number
}

/** One row of the rate-wise GST analysis table. */
export interface InvoiceTaxSlab {
  gstRateBps: number
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  taxMinor: number
}

export interface InvoiceBank {
  name: string
  code: string | null
}

export interface InvoiceTotals {
  taxableMinor: number
  cgstMinor: number
  sgstMinor: number
  igstMinor: number
  cessMinor: number
  discountMinor: number
  roundOffMinor: number
  totalMinor: number
  totalQtyE4: number
}

export interface InvoiceDocument {
  id: number
  type: 'SALES' | 'PURCHASE'
  number: string
  date: string
  dueDate: string | null
  referenceNo: string | null
  narration: string | null
  placeOfSupplyStateCode: string | null
  status: 'POSTED' | 'CANCELLED'
  company: InvoiceCompany
  party: InvoiceParty | null
  lines: InvoiceLine[]
  taxSlabs: InvoiceTaxSlab[]
  bank: InvoiceBank | null
  totals: InvoiceTotals
}

/**
 * GST Rule 48(1) names the copies of a goods invoice. The first copy goes to
 * the recipient and the second travels with the goods, which is what the two
 * page export reproduces.
 */
export const INVOICE_COPY_CAPTIONS = [
  'ORIGINAL FOR RECIPIENT',
  'DUPLICATE FOR TRANSPORTER'
] as const

export type InvoiceCopyCaption = (typeof INVOICE_COPY_CAPTIONS)[number]
