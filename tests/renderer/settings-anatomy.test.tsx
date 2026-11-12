import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CompanyPage } from '@/features/company/pages/CompanyPage'
import { NumberingPage } from '@/features/numbering/pages/NumberingPage'
import { UnitsPage } from '@/features/settings/pages/UnitsPage'
import { SessionProvider } from '@/context/session-context'
import type { CompanyProfile } from '../../src/shared/contracts/identity'
import type { NumberingRow } from '../../src/shared/contracts/numbering'
import type { UnitRow } from '../../src/shared/contracts/masters'

const originalApi = window.api

const PROFILE: CompanyProfile = {
  id: 1,
  slug: 'crown',
  name: 'Crown Books',
  legalName: 'Crown Books Pvt Ltd',
  gstin: '27ABCDE1234F1Z5',
  pan: null,
  stateCode: '27',
  address: null,
  city: null,
  pincode: null,
  phone: null,
  email: null,
  currency: 'INR',
  fyStartMonth: 4,
  booksBeginDate: '2026-04-01',
  logo: null,
  invoiceTerms: null,
  costingMethod: 'WEIGHTED_AVERAGE',
  roundOffMode: 'INVOICE',
  allowNegativeStock: false,
  status: 'ACTIVE',
  numberingSetupAt: '2026-11-01 10:30:00',
  onboardingCompletedAt: null
}

const NUMBERING: NumberingRow[] = [
  {
    voucherType: 'SALES',
    label: 'Sales invoice',
    series: 'INV',
    prefix: 'INV/',
    suffix: '',
    padding: 4,
    startNumber: 1,
    resetPeriod: 'YEARLY',
    manualOverride: false,
    fy: '2026-27',
    nextNumber: 'INV/0007',
    lastUsed: 6,
    usedCount: 6
  },
  {
    voucherType: 'PURCHASE',
    label: 'Purchase bill',
    series: 'PUR',
    prefix: 'PUR/',
    suffix: '',
    padding: 4,
    startNumber: 1,
    resetPeriod: 'YEARLY',
    manualOverride: false,
    fy: '2026-27',
    nextNumber: 'PUR/0003',
    lastUsed: 2,
    usedCount: 2
  }
]

const UNITS: UnitRow[] = [
  {
    id: 1,
    name: 'Numbers',
    symbol: 'nos',
    decimals: 0,
    isSystem: true,
    isActive: true,
    usageCount: 3
  },
  {
    id: 2,
    name: 'Kilogram',
    symbol: 'kg',
    decimals: 3,
    isSystem: true,
    isActive: false,
    usageCount: 0
  }
]

function renderWithClient(node: ReactElement): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  )
}

function mockCompany(profile: CompanyProfile): void {
  window.api = {
    identity: { company: vi.fn().mockResolvedValue(profile) }
  } as unknown as typeof window.api
}

afterEach(() => {
  window.api = originalApi
})

describe('Company setup readiness', () => {
  it('asks for required numbering before an optional GSTIN', async () => {
    mockCompany({ ...PROFILE, gstin: null, numberingSetupAt: null })
    renderWithClient(<CompanyPage />)

    const readiness = await screen.findByRole('region', { name: 'Setup readiness' })
    expect(within(readiness).getByText('Not on file')).toBeInTheDocument()
    expect(within(readiness).getByText('Not set')).toBeInTheDocument()
    expect(within(readiness).getByText('Books begin')).toBeInTheDocument()
    expect(within(readiness).getByText('Financial year')).toBeInTheDocument()

    const action = within(readiness).getByRole('link', { name: 'Set up voucher numbering' })
    expect(action).toHaveAttribute('href', '/settings/numbering')
    expect(within(readiness).getAllByRole('link')).toHaveLength(1)
  })

  it('asks for numbering when GSTIN is on file', async () => {
    mockCompany({ ...PROFILE, numberingSetupAt: null })
    renderWithClient(<CompanyPage />)

    const readiness = await screen.findByRole('region', { name: 'Setup readiness' })
    const action = within(readiness).getByRole('link', { name: 'Set up voucher numbering' })
    expect(action).toHaveAttribute('href', '/settings/numbering')
    expect(within(readiness).queryByRole('link', { name: /Add GSTIN/ })).not.toBeInTheDocument()
    expect(within(readiness).getAllByRole('link')).toHaveLength(1)
  })
})

describe('Voucher numbering anatomy', () => {
  it('shows the next sales and purchase numbers and when numbering was last saved', async () => {
    window.api = {
      numbering: { list: vi.fn().mockResolvedValue(NUMBERING) },
      identity: { company: vi.fn().mockResolvedValue(PROFILE) }
    } as unknown as typeof window.api
    renderWithClient(<NumberingPage />)

    const summary = await screen.findByRole('region', { name: 'Numbering summary' })
    expect(within(summary).getByText('INV/0007')).toBeInTheDocument()
    expect(within(summary).getByText('PUR/0003')).toBeInTheDocument()
    expect(within(summary).getByText('Last saved')).toBeInTheDocument()
    expect(within(summary).getByText(/1 Nov 2026/)).toBeInTheDocument()
  })

  it('keeps the table when the company profile is unavailable', async () => {
    window.api = {
      numbering: { list: vi.fn().mockResolvedValue(NUMBERING) },
      identity: { company: vi.fn().mockRejectedValue(new Error('offline')) }
    } as unknown as typeof window.api
    renderWithClient(<NumberingPage />)

    const summary = await screen.findByRole('region', { name: 'Numbering summary' })
    expect(within(summary).queryByText('Last saved')).not.toBeInTheDocument()
    expect(within(summary).getByText('INV/0007')).toBeInTheDocument()
  })
})

describe('Units anatomy', () => {
  it('explains in place why a unit used by items cannot be retired', async () => {
    window.api = {
      units: { list: vi.fn().mockResolvedValue(UNITS) }
    } as unknown as typeof window.api
    renderWithClient(
      <SessionProvider
        value={{
          companyId: 1,
          companySlug: 'crown',
          companyName: 'Crown Books',
          userId: 1,
          userFullName: 'Owner',
          userEmail: 'owner@example.com',
          roleId: 1,
          roleName: 'Owner',
          isSuper: true,
          permissions: ['settings.manage']
        }}
        onSignOut={() => undefined}
      >
        <UnitsPage />
      </SessionProvider>
    )

    expect(await screen.findByText('In use by 3 items')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retire/ })).toBeDisabled()
    expect(screen.getByText('Active units')).toBeInTheDocument()
    expect(screen.getByText('Used by items')).toBeInTheDocument()
    expect(screen.getByText('Inactive units')).toBeInTheDocument()
  })
})
