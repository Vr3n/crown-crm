import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { IpcResult } from '../../../src/shared/contracts/errors'

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { setupSalesDb, seedOrgWithSession } from '../../helpers/sales-db'
import { registerInvoicesIpc } from '../../../src/main/ipc/invoices'
import { createLead } from '../../../src/main/application/leads'
import { sellMembership } from '../../../src/main/application/memberships'
import { refundRepo } from '../../../src/main/repositories/finance'
import { getDrizzle } from '../../../src/main/db/connection'
import { membershipPlans } from '../../../src/main/db/schema'
import { eq } from 'drizzle-orm'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc.channels'
import type { SellMembershipInput } from '../../../src/shared/contracts/membership-sale'

setupSalesDb()

type Handler = (event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>

function handlerFor(channel: string): Handler {
  const call = mockHandle.mock.calls.find(([c]) => c === channel)
  if (!call) throw new Error(`No handler registered for "${channel}"`)
  return call[1] as unknown as Handler
}

beforeEach(() => {
  mockHandle.mockClear()
  registerInvoicesIpc()
})

function saleInput(leadId: number, planId: number, transactionId: string): SellMembershipInput {
  return {
    leadId,
    planId,
    offerId: null,
    joiningDate: '2026-08-25',
    startDate: '2026-08-25',
    endDate: '2026-11-22',
    issueDate: '2026-08-25',
    basePriceMinor: 150_000,
    discountType: 'NONE' as const,
    discountValueMinor: null,
    paidAmountMinor: 50_000,
    paymentMethod: 'UPI' as const,
    transactionId
  }
}

describe('invoices:get read model', () => {
  it('surfaces refunds against the invoice via the source payment', async () => {
    const { organizationId, userId } = seedOrgWithSession()
    const plan = getDrizzle()
      .select({ id: membershipPlans.id })
      .from(membershipPlans)
      .where(eq(membershipPlans.name, 'Monthly'))
      .get()!
    const lead = createLead({ fullName: 'Refund Customer', phone: '9876543210', sourceId: 1 })
    const sale = sellMembership(saleInput(lead.leadId, plan.id, 'refund-invoice-001'))

    // Issue a refund against the sale's payment (which is allocated to the invoice)
    refundRepo.create({
      organizationId,
      paymentId: sale.paymentId,
      amountMinor: 12_000,
      reason: 'Membership cancellation',
      createdBy: userId
    })

    const handler = handlerFor(IPC_CHANNELS.INVOICES_GET)
    const result = (await handler(null, { invoiceId: String(sale.invoiceId) })) as IpcResult<{
      refunds: Array<{
        refundNo: string
        refundDate: string
        amountMinor: number
        method: string
        reason: string
        sourcePaymentNo: string
      }>
    }>

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.refunds).toHaveLength(1)
    expect(result.data.refunds[0]).toMatchObject({
      refundNo: 'REF-0001',
      amountMinor: 12_000,
      method: 'UPI',
      reason: 'Membership cancellation',
      sourcePaymentNo: `PAY-${String(sale.paymentId).padStart(4, '0')}`
    })
  })
})
