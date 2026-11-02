import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VoucherEntryPage } from '@/features/vouchers/pages/VoucherEntryPage'
import type { ItemRow } from '../../src/shared/contracts/masters'

const originalApi = window.api

type EntryType = 'SALES' | 'PURCHASE'

const CESS_ITEM: ItemRow = {
  id: 7,
  name: 'Cess Widget',
  sku: 'CW-1',
  hsnSac: '8479',
  uom: 'nos',
  uomId: 1,
  gstRateBps: 1800,
  cessRateBps: 1200,
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

function renderEntry(type: EntryType, items: ItemRow[] = []): void {
  window.api = {
    identity: {
      company: vi.fn().mockResolvedValue({ stateCode: '27' })
    },
    parties: {
      list: vi.fn().mockResolvedValue([])
    },
    items: {
      list: vi.fn().mockResolvedValue(items)
    },
    vouchers: {
      post: vi.fn()
    }
  } as unknown as typeof window.api

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VoucherEntryPage type={type} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function selectItem(user: UserEvent, name: string): Promise<void> {
  await user.click(screen.getByRole('combobox', { name: 'Choose item or use free text' }))
  await user.click(await screen.findByText(name))
}

function summaryRow(label: string): string {
  return screen.getByText(label).parentElement?.textContent ?? ''
}

afterEach(() => {
  window.api = originalApi
})

describe('Voucher line inclusive tax toggle', () => {
  it('switches the preview between exclusive and inclusive tax', async () => {
    const user = userEvent.setup()
    renderEntry('SALES')

    await user.type(screen.getByLabelText('Description for line 1'), 'Widget')
    await user.type(screen.getByLabelText('Rate for line 1'), '2500')
    await user.type(screen.getByLabelText('GST % for line 1'), '18')

    expect(summaryRow('Taxable value')).toContain('2,500.00')
    expect(summaryRow('CGST')).toContain('225.00')
    expect(summaryRow('SGST')).toContain('225.00')

    const toggle = screen.getByRole('checkbox', { name: 'Rate includes tax for line 1' })
    expect(toggle).not.toBeChecked()
    await user.click(toggle)

    expect(toggle).toBeChecked()
    expect(summaryRow('Taxable value')).toContain('2,118.64')
    expect(summaryRow('CGST')).toContain('190.68')
    expect(summaryRow('SGST')).toContain('190.68')
  })

  it('matches the posted inclusive split for a cess-bearing item', async () => {
    const user = userEvent.setup()
    renderEntry('SALES', [CESS_ITEM])
    await selectItem(user, CESS_ITEM.name)

    // compute_line_tax at 2500 inclusive, 18% GST + 12% cess:
    // taxable 1923.08, CGST 173.07, SGST 173.08, cess 230.77, total 2500.00.
    expect(screen.getByRole('checkbox', { name: 'Rate includes tax for line 1' })).toBeChecked()
    expect(summaryRow('Taxable value')).toContain('1,923.08')
    expect(summaryRow('CGST')).toContain('173.07')
    expect(summaryRow('SGST')).toContain('173.08')
    expect(summaryRow('Cess')).toContain('230.77')
    expect(summaryRow('Total')).toContain('2,500.00')
  })

  it('matches the posted exclusive split for a cess-bearing purchase item', async () => {
    const user = userEvent.setup()
    renderEntry('PURCHASE', [CESS_ITEM])
    await selectItem(user, CESS_ITEM.name)

    // compute_line_tax at 1750 exclusive, 18% GST + 12% cess:
    // taxable 1750.00, CGST 157.50, SGST 157.50, cess 210.00, total 2275.00.
    expect(screen.getByRole('checkbox', { name: 'Rate includes tax for line 1' })).not.toBeChecked()
    expect(summaryRow('Taxable value')).toContain('1,750.00')
    expect(summaryRow('CGST')).toContain('157.50')
    expect(summaryRow('SGST')).toContain('157.50')
    expect(summaryRow('Cess')).toContain('210.00')
    expect(summaryRow('Total')).toContain('2,275.00')
  })
})
