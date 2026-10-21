import { exportInvoicePdf, exportReceiptPdf, exportRefundPdf } from '../application/pdf'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'
import { z } from 'zod'

const invoicePdfInputSchema = z.object({
  invoiceId: z.number().int().positive(),
  mode: z.enum(['save', 'preview']).optional()
})

const receiptPdfInputSchema = z.object({
  paymentId: z.number().int().positive(),
  mode: z.enum(['save', 'preview']).optional()
})

const refundPdfInputSchema = z.object({
  refundId: z.number().int().positive(),
  mode: z.enum(['save', 'preview']).optional()
})

export function registerPdfIpc(): void {
  handle(IPC_CHANNELS.PDF_EXPORT_INVOICE, invoicePdfInputSchema, (input) => exportInvoicePdf(input))
  handle(IPC_CHANNELS.PDF_EXPORT_RECEIPT, receiptPdfInputSchema, (input) => exportReceiptPdf(input))
  handle(IPC_CHANNELS.PDF_EXPORT_REFUND, refundPdfInputSchema, (input) => exportRefundPdf(input))
}
