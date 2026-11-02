import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ReportsPage } from '@/features/reports/pages/ReportsPage'
import type { ReceivableRow } from '../../src/shared/contracts/reports'

const originalApi = window.api

const ROWS: ReceivableRow[] = [
  {
    partyId: 1,
    partyName: 'Acme',
    notDueMinor: 100000,
    overdueMinor: 500000,
    totalMinor: 600000,
    bucketsMinor: [100000, 500000, 0, 0, 0],
    dueWithin7Minor: 0,
    dueWithin30Minor: 100000
  }
]

const UPDATED: ReceivableRow[] = [
  {
    partyId: 2,
    partyName: 'Later Customer',
    notDueMinor: 700000,
    overdueMinor: 0,
    totalMinor: 700000,
    bucketsMinor: [700000, 0, 0, 0, 0],
    dueWithin7Minor: 700000,
    dueWithin30Minor: 700000
  }
]

function renderPage(
  kind: 'receivables' | 'sales-register' = 'receivables'
): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/reports/${kind}`]}>
        <ReportsPage kind={kind} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function mockApi(receivables = vi.fn().mockResolvedValue(ROWS)): {
  receivables: ReturnType<typeof vi.fn>
} {
  window.api = {
    identity: {
      company: vi.fn().mockResolvedValue({ name: 'Crown Traders' })
    },
    reports: { receivables }
  } as unknown as typeof window.api
  return { receivables }
}

afterEach(() => {
  window.api = originalApi
})

describe('ReportsPage', () => {
  it('renders the chart and the table from one query', async () => {
    mockApi()
    renderPage()

    expect(
      await screen.findByRole('img', { name: 'Receivable outstanding by ageing bucket' })
    ).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Top 8 customers by overdue' })).toBeInTheDocument()
    expect(screen.getAllByText('Acme').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0)
  })

  it('keeps the print surface: company, period and hidden controls', async () => {
    mockApi()
    const { container } = renderPage()
    await screen.findAllByText('Acme')

    expect(container.querySelector('.report-print-head')).not.toBeNull()
    expect(container.querySelector('.report-print-foot')).not.toBeNull()
    expect(container.querySelector('.report-print-hide')).not.toBeNull()
    expect(screen.getAllByText('Crown Traders').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/As of:/).length).toBeGreaterThan(0)
  })

  it('updates the chart and the table together when the date changes', async () => {
    const { receivables } = mockApi(
      vi.fn().mockResolvedValueOnce(ROWS).mockResolvedValueOnce(UPDATED)
    )
    renderPage()
    await screen.findAllByText('Acme')

    fireEvent.change(screen.getByLabelText('As of'), {
      target: { value: '2026-12-31' }
    })

    expect(await screen.findByText('Later Customer')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Receivable outstanding by ageing bucket' })
    ).toBeInTheDocument()
    expect(screen.queryAllByText('Acme')).toHaveLength(0)
    await waitFor(() =>
      expect(receivables).toHaveBeenLastCalledWith('2026-12-31', 'DUE_DATE')
    )
  })

  it('shows the empty state without any chart when there are no rows', async () => {
    mockApi(vi.fn().mockResolvedValue([]))
    renderPage()
    expect(await screen.findByText('No receivables')).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })
})
