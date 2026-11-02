import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReportTable } from '@/features/reports/components/report-table'

const originalApi = window.api

afterEach(() => {
  window.api = originalApi
})

function renderTable(
  overrides: Partial<React.ComponentProps<typeof ReportTable>> = {}
): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/reports/receivables']}>
      <ReportTable
        head={['Party', 'Not due', 'Overdue', 'Total']}
        rows={[
          {
            cells: ['Acme', '₹0.00', '₹1,000.00', '₹1,000.00'],
            status: 'overdue',
            tones: [undefined, 'zero', undefined, undefined]
          }
        ]}
        numeric={[1, 2, 3]}
        footer={['Total', '', '₹1,000.00', '₹1,000.00']}
        empty={false}
        emptyTitle="No receivables"
        emptyText="Post an invoice."
        exportName="Receivables"
        {...overrides}
      />
    </MemoryRouter>
  )
}

describe('ReportTable', () => {
  it('carries the report accent and paper tint on the header', () => {
    renderTable()
    const header = screen.getByRole('columnheader', { name: 'Party' }).closest('tr')
    expect(header?.className).toContain('border-t-2')
    expect(header?.className).toContain('border-t-info')
    expect(header?.className).toContain('bg-muted/40')
  })

  it('marks overdue rows with a stripe and a text label, not colour alone', () => {
    renderTable()
    const row = screen.getByText('Acme').closest('tr') as HTMLElement
    expect(row).toHaveAttribute('data-status', 'overdue')
    expect(within(row).getByText('Overdue')).toBeInTheDocument()

    const firstCell = screen.getByText('Acme').closest('td')
    expect(firstCell?.className).toContain('border-l-[3px]')
    expect(firstCell?.className).toContain('border-l-destructive')
  })

  it('marks settled rows with the success stripe and the word', () => {
    renderTable({
      rows: [{ cells: ['Acme', '₹0.00', '₹0.00', '₹0.00'], status: 'settled' }]
    })
    const row = screen.getByText('Acme').closest('tr') as HTMLElement
    expect(within(row).getByText('Settled')).toBeInTheDocument()
    const firstCell = screen.getByText('Acme').closest('td')
    expect(firstCell?.className).toContain('border-l-success')
  })

  it('tones negative, credit and zero amounts', () => {
    renderTable({
      head: ['Account', 'Amount'],
      rows: [
        { cells: ['Debit', '-₹50.00'], tones: [undefined, 'negative'] },
        { cells: ['Credit', '₹20.00'], tones: [undefined, 'positive'] },
        { cells: ['Zero', '₹0.00'], tones: [undefined, 'zero'] }
      ],
      numeric: [1]
    })
    expect(screen.getByText('-₹50.00').closest('td')?.className).toContain('text-destructive')
    expect(screen.getByText('₹20.00').closest('td')?.className).toContain('text-success')
    expect(screen.getByText('₹0.00').closest('td')?.className).toContain('text-muted-foreground')
  })

  it('renders a tinted group header row that is not exported', async () => {
    const exportCsv = vi.fn().mockResolvedValue({ saved: true })
    window.api = { exportCsv } as unknown as typeof window.api
    renderTable({
      head: ['Account', 'Amount'],
      rows: [
        { group: 'Income', cells: [] },
        { cells: ['Sales', '₹100.00'] }
      ],
      numeric: [1],
      footer: undefined
    })

    const group = screen.getByText('Income').closest('tr')
    expect(group).toHaveAttribute('data-report-group')
    expect(group?.className).toContain('bg-accent-soft/60')

    fireEvent.click(screen.getByRole('button', { name: /CSV/ }))
    await waitFor(() => expect(exportCsv).toHaveBeenCalledTimes(1))
    const csv = exportCsv.mock.calls[0][0].csv as string
    expect(csv).toContain('Sales')
    expect(csv).not.toContain('Income,')
  })

  it('emphasises totals on a muted band behind a strong rule, without colour', () => {
    const { container } = renderTable()
    const footerRow = container.querySelector('tfoot tr')
    expect(footerRow?.className).toContain('border-t-2')
    expect(footerRow?.className).toContain('border-t-ink')
    expect(footerRow?.className).toContain('bg-muted/50')
    expect(footerRow?.className).toContain('font-semibold')
    expect(footerRow?.className).not.toContain('text-destructive')
    expect(footerRow?.className).not.toContain('text-success')
  })

  it('keeps the toolbar and table hooks the print stylesheet relies on', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/reports/receivables']}>
        <ReportTable
          head={['Party', 'Total']}
          rows={[{ cells: ['Acme', '₹1.00'] }]}
          numeric={[1]}
          empty={false}
          emptyTitle=""
          emptyText=""
          exportName="Receivables"
        />
      </MemoryRouter>
    )
    expect(container.querySelector('.report-table-card')).not.toBeNull()
    expect(container.querySelector('.report-table-toolbar')).not.toBeNull()
    expect(container.querySelector('table.report-table')).not.toBeNull()
  })

  it('shows the composed empty state instead of a blank grid', () => {
    renderTable({ rows: [], empty: true, footer: undefined })
    expect(screen.getByText('No receivables')).toBeInTheDocument()
    expect(screen.getByText('Post an invoice.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
