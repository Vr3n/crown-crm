import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ItemDialog } from '@/features/items/pages/ItemsPage'
import type { ItemRow, TaxRateRow } from '../../src/shared/contracts/masters'

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

const RATES: TaxRateRow[] = [
  {
    id: 1,
    gstRateBps: 1800,
    cessRateBps: 0,
    description: 'GST 18%',
    effectiveFrom: '2025-09-22',
    effectiveTo: null,
    isCurrent: true
  },
  {
    id: 2,
    gstRateBps: 1800,
    cessRateBps: 1200,
    description: 'GST 18% + 12% cess',
    effectiveFrom: '2025-09-22',
    effectiveTo: null,
    isCurrent: true
  }
]

function renderDialog(item: ItemRow = ITEM, onSaved = vi.fn()): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ItemDialog
        open
        onOpenChange={() => undefined}
        item={item}
        units={[{ id: 1, name: 'Numbers', symbol: 'nos' }]}
        taxRates={RATES}
        onSaved={onSaved}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  window.api = originalApi
})

describe('ItemDialog price breakup', () => {
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

  it('offers cess-bearing rates and shows the cess in both breakups', () => {
    renderDialog({ ...ITEM, cessRateBps: 1200 })

    expect(screen.getAllByText('GST 18% + 12% cess').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/GST 18% ₹315\.00 · Cess 12% ₹210\.00 · Landed ₹2,275\.00/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Taxable ₹1,923\.08 · GST 18% ₹346\.15 · Cess 12% ₹230\.77 · Customer pays ₹2,500\.00/
      )
    ).toBeInTheDocument()
  })

  it('sends both flags and the cess on save', async () => {
    const user = userEvent.setup()
    const update = vi.fn().mockImplementation((input) => Promise.resolve({ ...ITEM, ...input }))
    window.api = {
      items: { update, create: vi.fn() }
    } as unknown as typeof window.api
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    expect(update.mock.calls[0][0]).toMatchObject({
      id: 1,
      gstRateBps: 1800,
      cessRateBps: 0,
      salePriceIncludesTax: true,
      purchasePriceIncludesTax: false
    })
  })
})
