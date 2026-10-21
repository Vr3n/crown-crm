import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import {
  MarkUncollectibleDialog,
  VoidInvoiceDialog
} from '../../src/renderer/src/features/invoices/components/lifecycle-reason-dialogs'
import { renderWithClient } from './setup'

/** Lifecycle reason dialogs: reason is mandatory and passed through verbatim. */

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
  permissions: ['invoice.void'],
  onSignOut: vi.fn()
}

function mockBilling(): void {
  window.api.billing = {
    createInvoice: vi.fn(),
    addLine: vi.fn(),
    removeLine: vi.fn(),
    finalize: vi.fn(),
    void: vi.fn().mockResolvedValue({ id: 5, status: 'VOID' }),
    markUncollectible: vi.fn().mockResolvedValue({ id: 5, status: 'UNCOLLECTIBLE' }),
    getInvoice: vi.fn(),
    updateSnapshot: vi.fn(),
    nextNumber: vi.fn()
  } as never
  window.api.invoices = {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    listByStatus: vi.fn().mockResolvedValue([])
  } as never
}

function render(ui: React.ReactElement): ReturnType<typeof renderWithClient> {
  return renderWithClient(
    <SessionProvider value={ownerSession} onSignOut={vi.fn()}>
      {ui}
    </SessionProvider>
  )
}

describe('VoidInvoiceDialog', { timeout: 20000 }, () => {
  it('requires a non-empty reason before submitting', async () => {
    mockBilling()
    const onOpenChange = vi.fn()
    render(
      <VoidInvoiceDialog open invoiceId={5} invoiceNo="CRO-010926-01" onOpenChange={onOpenChange} />
    )
    const user = userEvent.setup()

    const submit = screen.getByRole('button', { name: 'Void invoice' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/^Reason/), 'Duplicate of CRO-010926-01')
    await user.click(submit)

    await waitFor(() => {
      expect(window.api.billing.void).toHaveBeenCalledWith({
        invoiceId: 5,
        reason: 'Duplicate of CRO-010926-01'
      })
    })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('rejects whitespace-only reasons', async () => {
    mockBilling()
    render(<VoidInvoiceDialog open invoiceId={5} onOpenChange={vi.fn()} />)
    const user = userEvent.setup()

    // The textarea trims for validation; typing spaces alone never enables submit.
    await user.type(screen.getByLabelText(/^Reason/), '   ')
    expect(screen.getByRole('button', { name: 'Void invoice' })).toBeDisabled()
    expect(window.api.billing.void).not.toHaveBeenCalled()
  })
})

describe('MarkUncollectibleDialog', () => {
  it('submits the write-off with its reason', async () => {
    mockBilling()
    render(
      <MarkUncollectibleDialog
        open
        invoiceId={9}
        invoiceNo="CRO-010926-02"
        onOpenChange={vi.fn()}
      />
    )
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/^Reason/), 'Customer relocated abroad')
    await user.click(screen.getByRole('button', { name: 'Mark uncollectible' }))

    await waitFor(() => {
      expect(window.api.billing.markUncollectible).toHaveBeenCalledWith({
        invoiceId: 9,
        reason: 'Customer relocated abroad'
      })
    })
  })
})
