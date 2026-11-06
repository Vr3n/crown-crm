import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VoucherEntryPage } from '@/features/vouchers/pages/VoucherEntryPage'
import { ReceiptEntryPage } from '@/features/vouchers/pages/ReceiptEntryPage'
import type { ItemRow, PartyRow } from '../../src/shared/contracts/masters'

const originalApi = window.api

const CREATED_PARTY: PartyRow = {
  id: 88,
  name: 'New Supplier Co',
  phone: null,
  email: null,
  gstin: null,
  stateCode: '27',
  billingAddress: null,
  notes: null,
  isCustomer: false,
  isSupplier: true,
  creditDays: 7,
  creditLimitMinor: 0,
  openingBalanceMinor: 0,
  isActive: true,
  balanceMinor: 0
}

const CREATED_CUSTOMER: PartyRow = {
  ...CREATED_PARTY,
  id: 77,
  name: 'New Customer Co',
  isCustomer: true,
  isSupplier: false
}

const CREATED_ITEM: ItemRow = {
  id: 99,
  name: 'New Widget',
  sku: null,
  hsnSac: null,
  uom: 'nos',
  uomId: 1,
  gstRateBps: 1800,
  cessRateBps: 0,
  isService: false,
  salePriceMinor: 11800,
  purchasePriceMinor: 8000,
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

function renderEntry(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VoucherEntryPage type="PURCHASE" />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  window.api = originalApi
})

describe('creating a master from a voucher picker', () => {
  it('creates a supplier from the party picker and selects it immediately', async () => {
    const user = userEvent.setup()
    const createParty = vi.fn().mockResolvedValue(CREATED_PARTY)
    window.api = {
      identity: { company: vi.fn().mockResolvedValue({ stateCode: '27' }) },
      parties: {
        list: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([CREATED_PARTY]),
        create: createParty
      },
      items: { list: vi.fn().mockResolvedValue([]) },
      vouchers: { post: vi.fn() }
    } as unknown as typeof window.api
    renderEntry()

    await user.click(screen.getByRole('combobox', { name: 'Select supplier' }))
    await user.click(screen.getByRole('button', { name: 'New supplier' }))

    expect(await screen.findByRole('heading', { name: 'New party' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Supplier' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Customer' })).not.toBeChecked()

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), CREATED_PARTY.name)
    await user.click(screen.getByRole('button', { name: 'Add party' }))

    await waitFor(() => expect(createParty).toHaveBeenCalledTimes(1))
    expect(createParty.mock.calls[0][0]).toMatchObject({
      name: CREATED_PARTY.name,
      isCustomer: false,
      isSupplier: true
    })

    expect(await screen.findByText(CREATED_PARTY.name)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Select supplier' })).toHaveTextContent(
      CREATED_PARTY.name
    )
  })

  it('creates an item from a line picker and fills the line immediately', async () => {
    const user = userEvent.setup()
    const createItem = vi.fn().mockResolvedValue(CREATED_ITEM)
    window.api = {
      identity: { company: vi.fn().mockResolvedValue({ stateCode: '27' }) },
      parties: { list: vi.fn().mockResolvedValue([]) },
      items: {
        list: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([CREATED_ITEM]),
        create: createItem
      },
      units: { list: vi.fn().mockResolvedValue([]) },
      taxRates: { list: vi.fn().mockResolvedValue([]) },
      vouchers: { post: vi.fn() }
    } as unknown as typeof window.api
    renderEntry()

    await user.click(screen.getByRole('combobox', { name: 'Choose item or use free text' }))
    await user.click(screen.getByRole('button', { name: 'New item' }))

    expect(await screen.findByRole('heading', { name: 'New item' })).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), CREATED_ITEM.name)
    await user.click(screen.getByRole('button', { name: 'Add item' }))

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1))
    expect(createItem.mock.calls[0][0]).toMatchObject({
      name: CREATED_ITEM.name,
      isService: false
    })

    expect(screen.getByRole('combobox', { name: `Item ${CREATED_ITEM.name}` })).toBeInTheDocument()
    expect(screen.getByLabelText('Description for line 1')).toHaveValue(CREATED_ITEM.name)
    expect(screen.getByLabelText('Rate for line 1')).toHaveValue('80')
    expect(screen.getByLabelText('GST % for line 1')).toHaveValue('18')
  })

  it('creates a customer from the receipt picker and selects it immediately', async () => {
    const user = userEvent.setup()
    const createParty = vi.fn().mockResolvedValue(CREATED_CUSTOMER)
    window.api = {
      parties: {
        list: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([CREATED_CUSTOMER]),
        create: createParty
      },
      vouchers: {
        post: vi.fn(),
        outstanding: vi.fn().mockResolvedValue([])
      }
    } as unknown as typeof window.api

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ReceiptEntryPage mode="RECEIPT" />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('combobox', { name: 'Select customer' }))
    await user.click(screen.getByRole('button', { name: 'New customer' }))
    await user.type(
      await screen.findByRole('textbox', { name: /^Name/ }),
      CREATED_CUSTOMER.name
    )
    await user.click(screen.getByRole('button', { name: 'Add party' }))

    await waitFor(() => expect(createParty).toHaveBeenCalledTimes(1))
    expect(createParty.mock.calls[0][0]).toMatchObject({
      name: CREATED_CUSTOMER.name,
      isCustomer: true,
      isSupplier: false
    })
    expect(screen.getByRole('combobox', { name: 'Select customer' })).toHaveTextContent(
      CREATED_CUSTOMER.name
    )
  })
})


