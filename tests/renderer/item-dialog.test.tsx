import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemDialog } from '@/features/items/pages/ItemsPage'
import type { ItemRow } from '../../src/shared/contracts/masters'

const originalApi = window.api

const ITEM: ItemRow = {
  id: 1,
  name: 'Toor Dal 1kg',
  sku: 'TD-1',
  hsnSac: '0713',
  uom: 'nos',
  uomId: 1,
  gstRateBps: 1800,
  cessRateBps: 0,
  isService: false,
  salePriceMinor: 250_000,
  purchasePriceMinor: 175_000,
  salePriceIncludesTax: true,
  purchasePriceIncludesTax: false,
  openingQtyE4: 0,
  openingRateMinor: 0,
  stockQtyE4: 0,
  reorderLevelE4: 0,
  stockGroupId: null,
  stockGroup: null,
  isActive: true
}

function renderDialog(item: ItemRow | null = ITEM, onSaved = vi.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ItemDialog
        open
        onOpenChange={() => undefined}
        item={item}
        units={[{ id: 1, name: 'Numbers', symbol: 'nos' }]}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  window.api = originalApi
})

describe('ItemDialog tax and price breakup', () => {
  it('shows landed purchase cost and the inclusive sale split', () => {
    renderDialog()

    expect(screen.getByText(/GST 18% ₹315\.00 · Landed ₹2,065\.00/)).toBeInTheDocument()
    expect(
      screen.getByText(/Taxable ₹2,118\.64 · GST 18% ₹381\.36 · Customer pays ₹2,500\.00/)
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Price includes tax/i })).toBeChecked()
  })

  it('recomputes the customer price when the flag is cleared', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('checkbox', { name: /Price includes tax/i }))

    expect(
      screen.getByText(/Taxable ₹2,500\.00 · GST 18% ₹450\.00 · Customer pays ₹2,950\.00/)
    ).toBeInTheDocument()
  })

  it('shows the typed cess in both breakups', () => {
    renderDialog({ ...ITEM, cessRateBps: 1200 })

    expect(screen.getByLabelText('Cess rate (%)')).toHaveValue('12')
    expect(
      screen.getByText(/GST 18% ₹315\.00 · Cess 12% ₹210\.00 · Landed ₹2,275\.00/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Taxable ₹1,923\.08 · GST 18% ₹346\.15 · Cess 12% ₹230\.77 · Customer pays ₹2,500\.00/
      )
    ).toBeInTheDocument()
  })

  it('recomputes the breakup from a manually typed GST rate', async () => {
    const user = userEvent.setup()
    renderDialog()

    const gst = screen.getByLabelText('GST rate (%)')
    await user.clear(gst)
    await user.type(gst, '5')

    expect(
      screen.getByText(/Taxable ₹2,380\.95 · GST 5% ₹119\.05 · Customer pays ₹2,500\.00/)
    ).toBeInTheDocument()
  })

  it('sends both flags and the typed percentages as basis points on save', async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockImplementation((input) => Promise.resolve({ ...ITEM, ...input }))
    window.api = {
      items: { update, create: vi.fn() }
    } as unknown as typeof window.api
    renderDialog()

    const gst = screen.getByLabelText('GST rate (%)')
    const cess = screen.getByLabelText('Cess rate (%)')
    await user.clear(gst)
    await user.type(gst, '12.5')
    await user.clear(cess)
    await user.type(cess, '3')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][0]).toMatchObject({
      id: 1,
      gstRateBps: 1250,
      cessRateBps: 300,
      salePriceIncludesTax: true,
      purchasePriceIncludesTax: false
    })
  })

  it('rejects a typed rate above the stored maximum', async () => {
    const user = userEvent.setup()
    const update = vi.fn()
    window.api = {
      items: { update, create: vi.fn() }
    } as unknown as typeof window.api
    renderDialog()

    const gst = screen.getByLabelText('GST rate (%)')
    await user.clear(gst)
    await user.type(gst, '50.009')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(
      await screen.findByText('Use a rate from 0 to 50 with up to 2 decimals')
    ).toBeInTheDocument()
    expect(gst).toHaveFocus()
    expect(gst).toHaveValue('50.009')
    expect(update).not.toHaveBeenCalled()
  })

  it('loads a legacy rate that is not in any master back into the field', async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockImplementation((input) => Promise.resolve({ ...ITEM, ...input }))
    window.api = {
      items: { update, create: vi.fn() }
    } as unknown as typeof window.api
    renderDialog({ ...ITEM, gstRateBps: 1234 })

    expect(screen.getByLabelText('GST rate (%)')).toHaveValue('12.34')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][0]).toMatchObject({ gstRateBps: 1234 })
  })

  it('creates an item with blank rates as zero', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockImplementation((input) => Promise.resolve({ ...ITEM, ...input }))
    window.api = {
      items: { update: vi.fn(), create }
    } as unknown as typeof window.api
    renderDialog(null)

    await user.type(screen.getByLabelText(/^Name/), 'Freight')
    await user.clear(screen.getByLabelText('GST rate (%)'))
    await user.clear(screen.getByLabelText('Cess rate (%)'))
    await user.click(screen.getByRole('button', { name: 'Add item' }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0][0]).toMatchObject({
      name: 'Freight',
      gstRateBps: 0,
      cessRateBps: 0
    })
  })
})
