import { invoiceRepo } from '../repositories/invoice'
import { NotFoundError } from '../domain/errors'
import type { InvoiceDocument } from '../../shared/contracts/invoice'

/**
 * The printable sales invoice / purchase bill. Only SALES and PURCHASE
 * vouchers have a tax invoice layout; everything else keeps the detail page
 * print, so a receipt id resolves to a not-found instead of a fake invoice.
 */
export function getInvoiceDocument(companyId: number, id: number): InvoiceDocument {
  const document = invoiceRepo.findForPrint(companyId, id)
  if (!document) throw new NotFoundError('Sales or purchase voucher not found')
  return document
}
