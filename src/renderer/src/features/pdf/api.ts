/**
 * Thin IPC facade for PDF export. Every method delegates to the preload bridge
 * (`window.api.pdf.*`).
 *
 * After a successful export, a missing-logo check runs fire-and-forget: when
 * the organization has a logo filename but the file is gone from disk, the
 * document already printed WITHOUT the logo (main never blocks print), so a
 * warning toast tells the user to re-upload in Organization settings.
 */
import { toast } from 'sonner'

async function warnIfLogoMissing(): Promise<void> {
  try {
    const logo = await window.api.organizationLogo.get()
    if (logo.logoFilename && !logo.logoData) {
      toast.warning('Printed without logo', {
        description: 'The logo file is missing — re-upload it in Organization settings.'
      })
    }
  } catch {
    // Never break the export flow on a best-effort warning.
  }
}

export const pdfApi = {
  /** Exports an invoice as PDF. Opens in system viewer (preview) or saves to Documents. */
  exportInvoice: async (
    invoiceId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => {
    const filePath = await window.api.pdf.exportInvoice({ invoiceId: Number(invoiceId), mode })
    void warnIfLogoMissing()
    return filePath
  },

  /** Exports a payment receipt as PDF. Opens in system viewer (preview) or saves to Documents. */
  exportReceipt: async (
    paymentId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => {
    const filePath = await window.api.pdf.exportReceipt({ paymentId: Number(paymentId), mode })
    void warnIfLogoMissing()
    return filePath
  },

  /** Exports a refund receipt as PDF. Opens in system viewer (preview) or saves to Documents/Refunds. */
  exportRefund: async (
    refundId: number | string,
    mode: 'save' | 'preview' = 'preview'
  ): Promise<string> => {
    const filePath = await window.api.pdf.exportRefund({ refundId: Number(refundId), mode })
    void warnIfLogoMissing()
    return filePath
  }
}
