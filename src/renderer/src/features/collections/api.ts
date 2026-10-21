import type { PaymentRecord, PaymentAllocation } from './types'
import type { PaymentRecordOutput } from '../../../../shared/contracts/collections'

function mapPaymentRecord(row: PaymentRecordOutput): PaymentRecord {
  return {
    id: row.id,
    reference: row.reference,
    customer: row.customer,
    amountMinor: row.amountMinor,
    method: row.method as PaymentRecord['method'],
    receivedAt: row.receivedAt,
    receivedBy: row.receivedBy,
    allocations: row.allocations.map((a): PaymentAllocation => ({
      invoiceNo: a.invoiceNo,
      amountMinor: a.amountMinor
    })),
    notes: row.notes
  }
}

/**
 * Thin IPC facade for the collections surface. Every method delegates to the
 * preload bridge (`window.api.collections.*`).
 */
export const api = {
  payments: (): Promise<PaymentRecord[]> =>
    window.api.collections.payments().then((rows) => rows.map(mapPaymentRecord)),
  payment: (id: string): Promise<PaymentRecord | undefined> =>
    window.api.collections
      .payment(parseInt(id, 10))
      .then((row) => (row ? mapPaymentRecord(row) : undefined))
}
