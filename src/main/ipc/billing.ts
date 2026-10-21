import {
  createInvoice,
  addInvoiceLine,
  removeInvoiceLine,
  finalizeInvoice,
  voidInvoice,
  markUncollectible,
  updateBillingSnapshot,
  nextInvoiceNumberPreview,
  getInvoice,
  listInvoicesByCustomer,
  listOpenInvoices
} from '../application/billing'
import {
  createInvoiceInputSchema,
  addInvoiceLineInputSchema,
  removeInvoiceLineInputSchema,
  finalizeInvoiceInputSchema,
  voidInvoiceInputSchema,
  markUncollectibleInputSchema,
  updateBillingSnapshotInputSchema,
  invoiceIdRequestSchema,
  invoiceNumberPreviewRequestSchema,
  customerInvoicesRequestSchema
} from '../../shared/contracts/billing'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerBillingIpc(): void {
  handle(IPC_CHANNELS.BILLING_CREATE_INVOICE, createInvoiceInputSchema, (input) =>
    createInvoice(input)
  )
  handle(IPC_CHANNELS.BILLING_ADD_LINE, addInvoiceLineInputSchema, (input) => addInvoiceLine(input))
  handle(IPC_CHANNELS.BILLING_REMOVE_LINE, removeInvoiceLineInputSchema, (input) =>
    removeInvoiceLine(input)
  )
  handle(IPC_CHANNELS.BILLING_FINALIZE, finalizeInvoiceInputSchema, (input) =>
    finalizeInvoice(input)
  )
  handle(IPC_CHANNELS.BILLING_VOID, voidInvoiceInputSchema, (input) => voidInvoice(input))
  handle(IPC_CHANNELS.BILLING_MARK_UNCOLLECTIBLE, markUncollectibleInputSchema, (input) =>
    markUncollectible(input)
  )
  handle(IPC_CHANNELS.BILLING_GET_INVOICE, invoiceIdRequestSchema, (input) => getInvoice(input))
  handle(IPC_CHANNELS.BILLING_UPDATE_SNAPSHOT, updateBillingSnapshotInputSchema, (input) =>
    updateBillingSnapshot(input)
  )
  handle(IPC_CHANNELS.BILLING_NEXT_NUMBER, invoiceNumberPreviewRequestSchema, (input) =>
    nextInvoiceNumberPreview(input)
  )
  handle(IPC_CHANNELS.BILLING_LIST_BY_CUSTOMER, customerInvoicesRequestSchema, (input) =>
    listInvoicesByCustomer(input)
  )
  handle(IPC_CHANNELS.BILLING_LIST_OPEN, () => listOpenInvoices())
}
