import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage'
import { SessionProvider } from '@/context/session-context'
import type { DashboardSummary } from '../../src/shared/contracts/dashboard'

const SESSION = {
  companyId: 1,
  companySlug: 'acme',
  companyName: 'Acme Distributors',
  userId: 1,
  userFullName: 'Viren Patel',
  userEmail: 'owner@acme.in',
  roleId: 1,
  roleName: 'Owner',
  isSuper: true,
  permissions: []
}

const SUMMARY: DashboardSummary = {
  partyCount: 0,
  itemCount: 0,
  voucherCount: 0,
  receivableMinor: 0,
  payableMinor: 0,
  cashBankMinor: 0,
  setup: { done: 0, total: 0, steps: [] },
  attention: [],
  recentVouchers: [],
  monthly: [],
  ageing: []
}

const originalApi = window.api

function renderDashboard(): void {
  window.api = {
    dashboard: { summary: vi.fn().mockResolvedValue(SUMMARY) }
  } as unknown as typeof window.api

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  render(
    <QueryClientProvider client={client}>
      <SessionProvider value={SESSION} onSignOut={() => undefined}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>
  )
}

describe('Dashboard greeting actions', () => {
  it('offers a colour-coded action for each book', async () => {
    renderDashboard()

    // Wait for the summary query so the page settles before asserting.
    expect(await screen.findByText('0 parties on file')).toBeInTheDocument()

    const sales = screen.getByRole('link', { name: 'New Sales Invoice' })
    const purchase = screen.getByRole('link', { name: 'New Purchase Invoice' })
    const item = screen.getByRole('link', { name: 'New Item Inventory' })

    expect(sales).toHaveAttribute('href', '/sales/new')
    expect(purchase).toHaveAttribute('href', '/purchases/new')
    expect(item).toHaveAttribute('href', '/items?action=new')

    expect(sales.className).toContain('bg-primary')
    expect(purchase.className).toContain('bg-stamp')
    expect(item.className).toContain('bg-warning')
  })

  it('no longer shows the generic new invoice action', async () => {
    renderDashboard()
    await screen.findByText('0 parties on file')

    expect(screen.queryByRole('link', { name: 'New invoice' })).not.toBeInTheDocument()
  })

  afterEach(() => {
    window.api = originalApi
  })
})
