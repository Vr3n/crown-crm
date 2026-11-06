import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ReportsPage } from '@/features/reports/pages/ReportsPage'
import type {
  BalanceSheetReport,
  TrialBalanceRow
} from '../../src/shared/contracts/reports'

const originalApi = window.api

const BALANCED: BalanceSheetReport = {
  assets: [{ id: 1, name: 'Cash', groupName: 'Current assets', type: 'ASSET', debitMinor: 100000, creditMinor: 0 }],
  liabilities: [{ id: 2, name: 'Loan', groupName: 'Loans', type: 'LIABILITY', debitMinor: 0, creditMinor: 40000 }],
  equity: [{ id: 3, name: 'Capital', groupName: 'Capital', type: 'EQUITY', debitMinor: 0, creditMinor: 60000 }],
  totalAssetsMinor: 100000,
  totalLiabilitiesMinor: 40000,
  totalEquityMinor: 60000,
  differenceMinor: 0
}

const OUT_OF_BALANCE: BalanceSheetReport = {
  ...BALANCED,
  differenceMinor: 2500
}

const TRIAL_BALANCE: TrialBalanceRow[] = [
  { id: 1, name: 'Cash', groupName: 'Current assets', type: 'ASSET', debitMinor: 100000, creditMinor: 0 },
  { id: 2, name: 'Bank', groupName: 'Current assets', type: 'ASSET', debitMinor: 25000, creditMinor: 0 },
  { id: 3, name: 'Sales', groupName: 'Income', type: 'INCOME', debitMinor: 0, creditMinor: 125000 }
]

function renderPage(kind: 'balance-sheet' | 'trial-balance'): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/reports/${kind}`]}>
        <ReportsPage kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function mockReports(overrides: Partial<typeof window.api.reports>): void {
  window.api = {
    identity: { company: vi.fn().mockResolvedValue({ name: 'Crown Traders' }) },
    reports: overrides
  } as unknown as typeof window.api
}

afterEach(() => {
  window.api = originalApi
})

describe('balance sheet structure', () => {
  it('shows the balanced state above the tables', async () => {
    mockReports({ balanceSheet: vi.fn().mockResolvedValue(BALANCED) })
    renderPage('balance-sheet')

    expect(await screen.findByRole('heading', { name: 'Balance check' })).toBeInTheDocument()
    expect(screen.getByText('Balanced')).toBeInTheDocument()
  })

  it('shows a non-zero difference without scrolling to the footer', async () => {
    mockReports({ balanceSheet: vi.fn().mockResolvedValue(OUT_OF_BALANCE) })
    renderPage('balance-sheet')

    expect(await screen.findByText(/Out by/)).toBeInTheDocument()
  })
})

describe('trial balance structure', () => {
  it('shows debit and credit totals per account group and keeps the proof row', async () => {
    mockReports({ trialBalance: vi.fn().mockResolvedValue(TRIAL_BALANCE) })
    renderPage('trial-balance')

    expect(
      await screen.findByRole('heading', { name: 'Debit and credit by account group' })
    ).toBeInTheDocument()

    const summary = screen
      .getByRole('heading', { name: 'Debit and credit by account group' })
      .closest('section') as HTMLElement
    expect(summary).not.toBeNull()
    expect(within(summary).getByText('Current assets')).toBeInTheDocument()
    expect(within(summary).getByText('Income')).toBeInTheDocument()
    expect(within(summary).getAllByText(/1,250/).length).toBeGreaterThan(0)

    expect(screen.getByText('Debits equal credits.')).toBeInTheDocument()
  })
})
