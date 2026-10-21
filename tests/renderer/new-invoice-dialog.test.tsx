import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import { NewInvoiceDialog } from '../../src/renderer/src/features/invoices/components/new-invoice-dialog'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import { renderWithClient } from './setup'

/**
 * Component tests for the two-phase New Invoice dialog (Module 04):
 * customer → createInvoice(DRAFT) → snapshot + line editor → finalize gating.
 */

vi.mock('@/features/finance/components/customer-picker', () => ({
  CustomerPicker: ({ onChange }: { onChange: (c: { id: string; name: string }) => void }) => (
    <button type="button" onClick={() => onChange({ id: '7', name: 'Rahul Mehta' })}>
      pick-customer
    </button>
  )
}))

const ownerSession: SessionContextValue = {
  organizationId: 1,
  organizationSlug: 'demo-gym',
  organizationName: 'Demo Gym',
  userId: 1,
  userFullName: 'Priya Verma',
  userEmail: 'priya@demo.com',
  roleId: 1,
  roleName: 'Owner',
  isSuper: true,
  permissions: ['invoice.create', 'invoice.finalize', 'invoice.void'],
  onSignOut: vi.fn()
}

const draftDetail = {
  invoice: {
    id: 42,
    number: 'DRAFT-temp',
    customerId: 7,
    status: 'DRAFT',
    billingName: 'Rahul Mehta',
    billingPhone: '9876501234',
    billingEmail: null,
    billingAddress: null,
    subtotalMinor: 0,
    taxMinor: 0,
    totalMinor: 0,
    finalizedAt: null,
    finalizedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: new Date().toISOString()
  },
  lines: []
}

function mockApi(): void {
  window.api.customers = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn()
  } as never
  window.api.billing = {
    createInvoice: vi.fn().mockResolvedValue({ id: 42, number: 'DRAFT-temp', status: 'DRAFT' }),
    getInvoice: vi.fn().mockResolvedValue(draftDetail),
    addLine: vi.fn(),
    removeLine: vi.fn(),
    finalize: vi.fn(),
    updateSnapshot: vi.fn(),
    nextNumber: vi.fn().mockResolvedValue({
      dateKey: '010926',
      prefix: 'CRO',
      nextValue: 1,
      preview: 'CRO-010926-01'
    })
  } as never
  window.api.invoices = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    listByStatus: vi.fn().mockResolvedValue([])
  } as never
  ;(window.api.catalog as { listPlans: ReturnType<typeof vi.fn> }).listPlans = vi
    .fn()
    .mockResolvedValue([])
}

function renderDialog(seedPlanId?: number): ReturnType<typeof renderWithClient> {
  return renderWithClient(
    <SessionProvider value={ownerSession} onSignOut={vi.fn()}>
      <TooltipProvider delayDuration={0}>
        <NewInvoiceDialog open onOpenChange={vi.fn()} seedPlanId={seedPlanId} />
      </TooltipProvider>
    </SessionProvider>
  )
}

describe('NewInvoiceDialog', { timeout: 20000 }, () => {
  it('keeps "Start draft" disabled until a customer is picked, then creates the draft with a numeric id', async () => {
    mockApi()
    renderDialog()
    const user = userEvent.setup()

    const start = await screen.findByRole('button', { name: 'Start draft' })
    expect(start).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'pick-customer' }))
    expect(start).toBeEnabled()

    await user.click(start)
    await waitFor(() => {
      expect(window.api.billing.createInvoice).toHaveBeenCalledWith({ customerId: 7 })
    })

    // Phase B reveals the prefilled billing snapshot.
    const name = await screen.findByLabelText(/^Name/)
    expect(name).toHaveValue('Rahul Mehta')
  })

  it('disables Finalize while the draft has no lines', async () => {
    mockApi()
    renderDialog()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'pick-customer' }))
    await user.click(await screen.findByRole('button', { name: 'Start draft' }))
    await screen.findByLabelText(/^Name/)

    expect(screen.getByRole('button', { name: /Finalize/ })).toBeDisabled()
  })

  it('converts decimal rupees into integer paise when adding a manual line', async () => {
    mockApi()
    ;(window.api.billing.addLine as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1 })
    renderDialog()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'pick-customer' }))
    await user.click(await screen.findByRole('button', { name: 'Start draft' }))

    await user.type(await screen.findByLabelText(/^Description/), 'Registration Fee')
    await user.type(screen.getByLabelText(/^Unit price/), '500.50')
    await user.click(screen.getByRole('button', { name: /Add line/ }))

    await waitFor(() => {
      expect(window.api.billing.addLine).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 42,
          description: 'Registration Fee',
          unitPriceMinor: 50_050,
          discountMinor: 0
        })
      )
    })
  })
})
