import type {
  AddInvoiceLineInput,
  CreateInvoiceInput,
  FinalizeInvoiceInput,
  InvoiceNumberPreviewRequest,
  MarkUncollectibleInput,
  RemoveInvoiceLineInput,
  UpdateBillingSnapshotInput,
  VoidInvoiceInput
} from '../../../../shared/contracts/billing'
import type { Invoice, InvoiceStatus } from './types'

/**
 * Thin IPC facade for the invoices surface. Every method delegates to the
 * preload bridge (`window.api.invoices.*` for reads, `window.api.billing.*`
 * for the Module 04 commands).
 */
export const api = {
  invoices: (): Promise<Invoice[]> => window.api.invoices.list() as unknown as Promise<Invoice[]>,
  invoice: (id: string): Promise<Invoice | undefined> =>
    window.api.invoices.get({ invoiceId: id }) as unknown as Promise<Invoice | undefined>,
  invoicesByStatus: (status: InvoiceStatus | undefined): Promise<Invoice[]> =>
    window.api.invoices.listByStatus({ status: status as never }) as unknown as Promise<Invoice[]>
}

/** Module 04 commands (DRAFT lifecycle). Wire types are the shared contracts. */
export const invoiceCommands = {
  create: (input: CreateInvoiceInput): Promise<unknown> => window.api.billing.createInvoice(input),
  addLine: (input: AddInvoiceLineInput): Promise<unknown> => window.api.billing.addLine(input),
  removeLine: (input: RemoveInvoiceLineInput): Promise<void> =>
    window.api.billing.removeLine(input),
  finalize: (input: FinalizeInvoiceInput): Promise<unknown> => window.api.billing.finalize(input),
  void: (input: VoidInvoiceInput): Promise<unknown> => window.api.billing.void(input),
  markUncollectible: (input: MarkUncollectibleInput): Promise<unknown> =>
    window.api.billing.markUncollectible(input),
  updateSnapshot: (input: UpdateBillingSnapshotInput): Promise<unknown> =>
    window.api.billing.updateSnapshot(input),
  nextNumber: (input?: InvoiceNumberPreviewRequest) => window.api.billing.nextNumber(input),
  detail: (invoiceId: number) => window.api.billing.getInvoice({ invoiceId })
}
