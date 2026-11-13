import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { ExcelImportPage } from '@/features/imports/pages/ExcelImportPage'
import { createDemoRuntime } from '@/features/imports/lib/demo-runtime'

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExcelImportPage runtime={createDemoRuntime()} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

async function openSample(user: UserEvent): Promise<void> {
  renderPage()
  await user.click(screen.getByRole('button', { name: /try the sample/i }))
  await screen.findByRole('heading', { name: 'Sheet and range' })
}

describe('Excel importer page', () => {
  it('imports the sample purchase workbook end to end', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(screen.getByRole('heading', { name: 'Import from Excel' })).toBeInTheDocument()
    expect(screen.getByText(/demo data/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try the sample/i }))
    expect(await screen.findByRole('heading', { name: 'Sheet and range' })).toBeInTheDocument()
    expect(screen.getByText(/11 data rows/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /map columns/i }))
    expect(await screen.findByRole('heading', { name: 'Match your columns' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Column for Supplier' })).toHaveValue('2')
    expect(screen.getByRole('combobox', { name: 'Column for Supplier bill no.' })).toHaveValue('0')

    await user.click(screen.getByRole('button', { name: /check rows/i }))
    expect(
      await screen.findByRole('heading', { name: 'Purchase bills to create' })
    ).toBeInTheDocument()
    expect(screen.getByText('Will be created as a new supplier')).toBeInTheDocument()

    const importButton = screen.getByRole('button', { name: /import 8 purchase bills/i })
    await waitFor(() => expect(importButton).toBeEnabled())
    await user.click(importButton)

    expect(
      await screen.findByRole('heading', { name: '8 purchase bills posted' }, { timeout: 10_000 })
    ).toBeInTheDocument()
    const newSuppliers = screen.getAllByText('New suppliers').find((node) => node.tagName === 'P')
    expect(newSuppliers?.parentElement?.textContent).toContain('1')
  })

  it('blocks on an unresolved supplier and clears when the user chooses create', async () => {
    const user = userEvent.setup()
    await openSample(user)

    await user.click(screen.getByRole('button', { name: /map columns/i }))
    await screen.findByRole('heading', { name: 'Match your columns' })
    await user.click(screen.getByRole('checkbox', { name: /create suppliers that do not exist/i }))
    await user.click(screen.getByRole('button', { name: /check rows/i }))

    await screen.findByRole('heading', { name: 'Purchase bills to create' })
    const importButton = screen.getByRole('button', { name: /import 8 purchase bills/i })
    expect(importButton).toBeDisabled()
    expect(screen.getAllByText(/is not in your parties/i).length).toBeGreaterThan(0)

    const select = screen.getByRole('combobox', {
      name: 'Match New Supplier Co to a supplier'
    })
    expect(select).toHaveValue('')
    await user.selectOptions(select, 'create')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /import 8 purchase bills/i })).toBeEnabled()
    )
  })

  it('reads a real xlsx file through the upload input', async () => {
    const user = userEvent.setup()
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Bill No', 'Date', 'Supplier', 'Item', 'Qty', 'Rate', 'GST %'],
      ['A-1', '05-04-2026', 'Sharma Traders', 'SSD 256GB', 1, 100, 18],
      ['A-1', '05-04-2026', 'Sharma Traders', 'USB-C Cable', 2, 50, 18]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bills')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
    const file = new File([buffer], 'bills.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })

    renderPage()
    await user.upload(screen.getByLabelText('Choose an Excel file'), file)
    expect(await screen.findByRole('heading', { name: 'Sheet and range' })).toBeInTheDocument()
    expect(screen.getByText(/2 data rows/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /map columns/i }))
    await screen.findByRole('heading', { name: 'Match your columns' })
    await user.click(screen.getByRole('button', { name: /check rows/i }))
    expect(
      await screen.findByRole('heading', { name: 'Purchase bills to create' })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import 1 purchase bill/i })).toBeInTheDocument()
  })

  it('switches sheets and reports a free-text item as a warning, not an error', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /sales invoices/i }))
    await user.click(screen.getByRole('button', { name: /try the sample/i }))
    await screen.findByRole('heading', { name: 'Sheet and range' })

    await user.click(screen.getByRole('tab', { name: /sales may/i }))
    expect(await screen.findByText(/9 data rows/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /map columns/i }))
    await screen.findByRole('heading', { name: 'Match your columns' })
    await user.click(screen.getByRole('button', { name: /check rows/i }))

    expect(
      await screen.findByRole('heading', { name: 'Sales invoices to create' })
    ).toBeInTheDocument()
    expect(screen.getByText('0 errors, 1 warning')).toBeInTheDocument()
    expect(screen.getByText(/1 item line does not match/i)).toBeInTheDocument()
    expect(screen.getByText('Installation Service')).toBeInTheDocument()

    const importButton = screen.getByRole('button', { name: /import 7 sales invoices/i })
    await waitFor(() => expect(importButton).toBeEnabled())
  })
})
