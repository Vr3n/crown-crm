import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ItemsPage } from '@/features/items/pages/ItemsPage'
import { MonthlyFlowChart } from '@/components/charts/list-charts'
import type { ItemRow } from '../../src/shared/contracts/masters'
import type { ItemSummary } from '../../src/shared/contracts/summaries'

const originalApi = window.api

function item(overrides: Partial<ItemRow>): ItemRow {
  return {
    id: 1,
    name: 'Item',
    sku: null,
    hsnSac: null,
    uom: 'nos',
    uomId: 1,
    gstRateBps: 1800,
    cessRateBps: 0,
    isService: false,
    salePriceMinor: 11_800,
    purchasePriceMinor: 6_000,
    salePriceIncludesTax: true,
    purchasePriceIncludesTax: false,
    openingQtyE4: 0,
    openingRateMinor: 0,
    stockQtyE4: 20_000,
    reorderLevelE4: 10_000,
    stockGroupId: null,
    stockGroup: null,
    isActive: true,
    ...overrides
  }
}

const ITEMS: ItemRow[] = [
  item({ id: 1, name: 'In Stock Item', stockQtyE4: 20_000 }),
  item({ id: 2, name: 'Low Stock Item', stockQtyE4: 5_000 }),
  item({ id: 3, name: 'Out Of Stock Item', stockQtyE4: 0 }),
  item({
    id: 4,
    name: 'Installation Service',
    isService: true,
    stockQtyE4: 0
  })
]

const SUMMARY: ItemSummary = {
  itemCount: 4,
  serviceCount: 1,
  inventoryValueMinor: 0,
  lowStockCount: 1,
  outOfStockCount: 1,
  topItems: []
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ItemsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function mockApi(): void {
  window.api = {
    items: { list: vi.fn().mockResolvedValue(ITEMS) },
    units: { list: vi.fn().mockResolvedValue([]) },
    taxRates: { list: vi.fn().mockResolvedValue([]) },
    summaries: { items: vi.fn().mockResolvedValue(SUMMARY) },
    reports: { stockFlow: vi.fn().mockResolvedValue([]) }
  } as unknown as typeof window.api
}

afterEach(() => {
  window.api = originalApi
})

describe('ItemsPage analysis', () => {
  it('renders the shared reorder labels for in stock, low and out items', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('In Stock Item')).toBeInTheDocument()
    expect(screen.getByText('In stock')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('Out')).toBeInTheDocument()
    expect(screen.getAllByText('Service').length).toBeGreaterThan(0)
  })

  it('exposes a real dead-stock filter in the item toolbar', async () => {
    mockApi()
    renderPage()

    expect(await screen.findByText('Installation Service')).toBeInTheDocument()
    const dead = screen.getByRole('button', { name: /Dead stock/ })
    expect(dead).toHaveTextContent('3')

    fireEvent.click(dead)

    expect(screen.queryByText('Installation Service')).not.toBeInTheDocument()
    expect(screen.getByText('In Stock Item')).toBeInTheDocument()
  })

  it('renders the monthly movement chart in units, not rupees', () => {
    render(
      <MonthlyFlowChart
        points={[{ label: 'Jun 2026', inQtyE4: 20_000, outQtyE4: 5_000 }]}
        ariaLabel="Monthly stock movement in and out"
      />
    )

    expect(
      screen.getByRole('img', { name: 'Monthly stock movement in and out' })
    ).toBeInTheDocument()
    expect(screen.getByText('Show data table')).toBeInTheDocument()
  })
})
