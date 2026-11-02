import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VoucherEntryPage } from '@/features/vouchers/pages/VoucherEntryPage'
import type { PartyRow } from '../../src/shared/contracts/masters'

const originalApi = window.api

const SUPPLIER: PartyRow = {
  id: 42,
  name: 'Mehta Supplies',
  phone: null,
  email: null,
  gstin: '27AABFU4477G1ZY',
  stateCode: '27',
  billingAddress: null,
  notes: null,
  isCustomer: false,
  isSupplier: true,
  creditDays: 0,
  creditLimitMinor: 0,
  openingBalanceMinor: 0,
  isActive: true,
  balanceMinor: 0
}

function renderPurchase(
  post = vi.fn().mockResolvedValue({ id: 1, number: 'TC/2026-27/583' })
): {
  post: typeof post
} {
  window.api = {
    identity: {
      company: vi.fn().mockResolvedValue({ stateCode: '27' })
    },
    parties: {
      list: vi.fn().mockResolvedValue([SUPPLIER])
    },
    items: {
      list: vi.fn().mockResolvedValue([])
    },
    vouchers: {
      post
    }
  } as unknown as typeof window.api

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VoucherEntryPage type="PURCHASE" />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return { post }
}

async function chooseSupplier(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Select supplier' }))
  await user.click(await screen.findByText(SUPPLIER.name))
}

async function fillLine(user: UserEvent): Promise<void> {
  await user.type(screen.getByLabelText('Description for line 1'), 'Packing tape')
  await user.type(screen.getByLabelText('Rate for line 1'), '100')
}

afterEach(() => {
  window.api = originalApi
})

describe('Purchase supplier bill number', () => {
  it('requires the supplier bill number and moves focus there after the supplier', async () => {
    const user = userEvent.setup()
    renderPurchase()

    const field = screen.getByLabelText(/Supplier bill no\./i) as HTMLInputElement
    expect(field).toBeInTheDocument()
    expect(field).toHaveValue('')

    await chooseSupplier(user)
    await waitFor(() => expect(field).toHaveFocus())

    await fillLine(user)
    expect(
      screen.getByText('Enter the supplier bill number, or tick "No supplier bill".')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post bill' })).toBeDisabled()
  })

  it('submits the typed number as typed and shows it as the document identity', async () => {
    const user = userEvent.setup()
    const { post } = renderPurchase()

    await chooseSupplier(user)
    await fillLine(user)
    await user.type(screen.getByLabelText(/Supplier bill no\./i), 'TC/2026-27/583')

    expect(screen.getByText(/TC\/2026-27\/583 · Purchase bill/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Post bill' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    const payload = post.mock.calls[0][0]
    expect(payload.supplierBillNo).toBe('TC/2026-27/583')
    expect(payload.supplierBillMissing).toBe(false)
  })

  it('disables the field and posts an internal number when there is no supplier bill', async () => {
    const user = userEvent.setup()
    const { post } = renderPurchase(vi.fn().mockResolvedValue({ id: 2, number: 'PUR/0001' }))

    await chooseSupplier(user)
    await fillLine(user)

    const field = screen.getByLabelText(/Supplier bill no\./i) as HTMLInputElement
    await user.type(field, 'TC/1')
    await user.click(screen.getByRole('checkbox', { name: 'No supplier bill' }))

    expect(field).toBeDisabled()
    expect(field).toHaveValue('')
    expect(
      screen.getByText(
        'No supplier bill: this purchase takes the internal PUR number and the print shows an em dash as the supplier bill no.'
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Post bill' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))

    const payload = post.mock.calls[0][0]
    expect(payload.supplierBillNo).toBeNull()
    expect(payload.supplierBillMissing).toBe(true)
  })

  it('shows a duplicate supplier bill inline on the field', async () => {
    const user = userEvent.setup()
    const duplicate = Object.assign(
      new Error(
        'Supplier bill TC/2026-27/583 dated 2026-04-10 is already recorded for this supplier'
      ),
      { code: 'DUPLICATE_SUPPLIER_BILL' }
    )
    renderPurchase(vi.fn().mockRejectedValue(duplicate))

    await chooseSupplier(user)
    await fillLine(user)
    const field = screen.getByLabelText(/Supplier bill no\./i) as HTMLInputElement
    await user.type(field, 'TC/2026-27/583')
    await user.click(screen.getByRole('button', { name: 'Post bill' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Supplier bill TC/2026-27/583 dated 2026-04-10 is already recorded for this supplier'
    )
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveFocus()
  })

  it('does not show the supplier bill field on a sales invoice', () => {
    window.api = {
      identity: { company: vi.fn().mockResolvedValue({ stateCode: '27' }) },
      parties: { list: vi.fn().mockResolvedValue([]) },
      items: { list: vi.fn().mockResolvedValue([]) },
      vouchers: { post: vi.fn() }
    } as unknown as typeof window.api

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <VoucherEntryPage type="SALES" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.queryByLabelText(/Supplier bill no\./i)).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'No supplier bill' })).toBeNull()
  })
})
