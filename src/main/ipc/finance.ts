import {
  recordPayment,
  allocatePayment,
  recordAndAllocatePayment,
  issueRefund,
  issueCredit,
  applyCredit,
  getInvoicePaymentState,
  getPaymentHistory,
  getRefundHistory,
  getCreditBalance,
  listCredits,
  listPaymentMethods,
  getOutstandingInvoices,
  getAllPayments,
  getAllRefunds,
  getAllCredits,
  processScheduledRefunds
} from '../application/finance'
import {
  recordPaymentInputSchema,
  allocatePaymentInputSchema,
  recordAndAllocatePaymentInputSchema,
  issueRefundInputSchema,
  issueCreditInputSchema,
  applyCreditInputSchema,
  invoicePaymentStateRequestSchema,
  paymentIdRequestSchema,
  customerPaymentsRequestSchema,
  customerCreditBalanceRequestSchema,
  outstandingInvoicesRequestSchema,
  listPaymentsInputSchema,
  listRefundsInputSchema,
  listCreditsInputSchema
} from '../../shared/contracts/finance'
import { IPC_CHANNELS } from '../../shared/contracts/ipc.channels'
import { handle } from './handle'

export function registerFinanceIpc(): void {
  handle(IPC_CHANNELS.FINANCE_RECORD_PAYMENT, recordPaymentInputSchema, (input) =>
    recordPayment(input)
  )
  handle(IPC_CHANNELS.FINANCE_ALLOCATE_PAYMENT, allocatePaymentInputSchema, (input) =>
    allocatePayment(input)
  )
  handle(IPC_CHANNELS.FINANCE_RECORD_AND_ALLOCATE, recordAndAllocatePaymentInputSchema, (input) =>
    recordAndAllocatePayment(input)
  )
  handle(IPC_CHANNELS.FINANCE_ISSUE_REFUND, issueRefundInputSchema, (input) => issueRefund(input))
  handle(IPC_CHANNELS.FINANCE_ISSUE_CREDIT, issueCreditInputSchema, (input) => issueCredit(input))
  handle(IPC_CHANNELS.FINANCE_APPLY_CREDIT, applyCreditInputSchema, (input) => applyCredit(input))
  handle(IPC_CHANNELS.FINANCE_GET_INVOICE_STATE, invoicePaymentStateRequestSchema, (input) =>
    getInvoicePaymentState(input)
  )
  handle(IPC_CHANNELS.FINANCE_PAYMENT_HISTORY, customerPaymentsRequestSchema, (input) =>
    getPaymentHistory(input)
  )
  handle(IPC_CHANNELS.FINANCE_REFUND_HISTORY, paymentIdRequestSchema, (input) =>
    getRefundHistory(input)
  )
  handle(IPC_CHANNELS.FINANCE_CREDIT_BALANCE, customerCreditBalanceRequestSchema, (input) =>
    getCreditBalance(input)
  )
  handle(IPC_CHANNELS.FINANCE_LIST_CREDITS, customerCreditBalanceRequestSchema, (input) =>
    listCredits(input)
  )
  handle(IPC_CHANNELS.FINANCE_LIST_PAYMENT_METHODS, () => listPaymentMethods())
  handle(IPC_CHANNELS.FINANCE_OUTSTANDING_INVOICES, outstandingInvoicesRequestSchema, (input) =>
    getOutstandingInvoices(input)
  )
  handle(IPC_CHANNELS.FINANCE_LIST_PAYMENTS, listPaymentsInputSchema, () => getAllPayments())
  handle(IPC_CHANNELS.FINANCE_LIST_REFUNDS, listRefundsInputSchema, () => getAllRefunds())
  handle(IPC_CHANNELS.FINANCE_LIST_ALL_CREDITS, listCreditsInputSchema, () => getAllCredits())
  handle(IPC_CHANNELS.FINANCE_PROCESS_SCHEDULED_REFUNDS, () => processScheduledRefunds())
}
