import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { invoiceVoucherIdSchema } from '../../shared/contracts/invoice'
import { getInvoiceDocument } from '../application/invoice'
import { exportInvoicePdf } from '../export/invoice-pdf'
import { currentCompanyId, requirePermission } from '../auth/session'
import { PERMISSIONS } from '../db/permissions'
import { handle } from './handle'

export function registerInvoiceIpc(): void {
  handle(IPC_CHANNELS.VOUCHERS_INVOICE, invoiceVoucherIdSchema, (input) => {
    requirePermission(PERMISSIONS.VOUCHER_VIEW)
    return getInvoiceDocument(currentCompanyId(), input.id)
  })

  /**
   * The main process resolves the document and the filename itself. The
   * renderer only sends the voucher id, so it cannot print a voucher from
   * another company or choose a path without the native dialog.
   */
  handle(IPC_CHANNELS.INVOICE_EXPORT_PDF, invoiceVoucherIdSchema, async (input) => {
    requirePermission(PERMISSIONS.VOUCHER_VIEW)
    const document = getInvoiceDocument(currentCompanyId(), input.id)
    const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    return exportInvoicePdf({ document, parent })
  })
}
