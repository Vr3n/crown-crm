import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { VoucherEntryPage } from '@/features/vouchers/pages/VoucherEntryPage'

const originalApi = window.api

function renderSalesEntry(): void {
  window.api = {
    identity: {
      company: vi.fn().mockResolvedValue({ stateCode: '27' })
    },
    parties: {
      list: vi.fn().mockResolvedValue([])
    },
    items: {
      list: vi.fn().mockResolvedValue([])
    },
    vouchers: {
      post: vi.fn()
    }
  } as unknown as typeof window.api

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VoucherEntryPage type="SALES" />
      </MemoryRouter>
    </QueryClientProvider>
  )
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
    renderSalesEntry()

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
})
