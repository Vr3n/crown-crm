import type { Payment, Refund, Credit, FinanceInvoice, InvoiceStatus } from './types'
import type { PersonRef } from '@/features/dashboard/types'

interface RecordPaymentInput {
  customerId: string
  paymentDate: string
  amountMinor: number
  paymentMethod: string
  reference?: string
  notes?: string
  allocations?: { invoiceId: string; amountMinor: number }[]
}

interface IssueRefundInput {
  paymentId: string
  amountMinor: number
  reason: string
}

interface IssueCreditInput {
  customerId: string
  amountMinor: number
  reason: string
  expiresAt?: string
}

/**
 * Thin IPC facade for the finance surface. Every method delegates to the
 * preload bridge (`window.api.finance.*`). Money fields stay integer minor
 * units end-to-end; formatting happens only in components via `formatMinor`.
 */
export const api = {
  payments: (): Promise<Payment[]> =>
    window.api.finance.listPayments() as unknown as Promise<Payment[]>,
  refunds: (): Promise<Refund[]> =>
    window.api.finance.listRefunds() as unknown as Promise<Refund[]>,
  /** Issues any scheduled refunds whose date has arrived; returns count issued. */
  processScheduledRefunds: (): Promise<{ issued: number }> =>
    window.api.finance.processScheduledRefunds(),
  credits: (): Promise<Credit[]> =>
    window.api.finance.listAllCredits() as unknown as Promise<Credit[]>,
  invoices: (): Promise<FinanceInvoice[]> => Promise.resolve([]),
  customers: (): Promise<PersonRef[]> =>
    window.api.customers.list() as unknown as Promise<PersonRef[]>,
  outstandingInvoicesFor: (customerId: string): Promise<FinanceInvoice[]> =>
    window.api.finance
      .outstandingInvoicesFor({ customerId: parseInt(customerId, 10) })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          invoiceNo: row.invoiceNo,
          customer: { id: customerId, name: row.customerName, phone: row.customerPhone },
          line: row.line,
          issuedAt: row.issuedAt,
          totalMinor: row.totalMinor,
          paidMinor: row.paidMinor,
          status: row.status as InvoiceStatus
        }))
      ),
  paymentsFor: (customerId: string): Promise<Payment[]> =>
    window.api.finance.paymentHistory({
      customerId: parseInt(customerId, 10)
    }) as unknown as Promise<Payment[]>,
  recordPayment: async (input: RecordPaymentInput): Promise<Payment> => {
    // Step 1: Record the payment
    const paymentRow = await window.api.finance.recordPayment({
      customerId: parseInt(input.customerId, 10),
      paymentDate: input.paymentDate,
      amountMinor: input.amountMinor,
      paymentMethod: input.paymentMethod,
      reference: input.reference ?? null,
      notes: input.notes ?? null
    })

    // Step 2: Allocate to each invoice if allocations provided
    if (input.allocations?.length) {
      for (const alloc of input.allocations) {
        await window.api.finance.allocatePayment({
          paymentId: paymentRow.id,
          invoiceId: parseInt(alloc.invoiceId, 10),
          amountMinor: alloc.amountMinor
        })
      }
    }

    // Return a Payment-shaped object (the read model will be rebuilt on cache invalidation)
    return {
      id: String(paymentRow.id),
      paymentNo: `PAY-${paymentRow.id}`,
      customer: { id: input.customerId, name: '' },
      paymentDate: input.paymentDate,
      amountMinor: input.amountMinor,
      method: input.paymentMethod as Payment['method'],
      reference: input.reference,
      notes: input.notes,
      createdBy: '',
      allocations: (input.allocations ?? []).map((a) => ({
        invoiceId: a.invoiceId,
        invoiceNo: '',
        amountMinor: a.amountMinor
      })),
      refundIds: []
    } as Payment
  },
  issueRefund: (input: IssueRefundInput): Promise<Refund> =>
    window.api.finance.issueRefund({
      paymentId: parseInt(input.paymentId, 10),
      amountMinor: input.amountMinor,
      reason: input.reason
    }) as unknown as Promise<Refund>,
  issueCredit: (input: IssueCreditInput): Promise<Credit> =>
    window.api.finance.issueCredit({
      customerId: parseInt(input.customerId, 10),
      amountMinor: input.amountMinor,
      reason: input.reason,
      expiresAt: input.expiresAt ?? null
    }) as unknown as Promise<Credit>
}
