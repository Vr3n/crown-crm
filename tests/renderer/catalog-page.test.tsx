import { MemoryRouter } from 'react-router-dom'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SessionContextValue } from '@/context/session-context'
import { SessionProvider } from '@/context/session-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { OffersPage } from '@/features/catalog/pages/OffersPage'
import { PlansPage } from '@/features/catalog/pages/PlansPage'
import type {
  OfferRow,
  OfferVersionRow,
  PlanRow,
  PlanVersionRow
} from '../../src/shared/contracts/catalog'
import { renderWithClient } from './setup'

/**
 * Catalog renderer tests — the plans/offers pages talk to the real IPC facade
 * (`window.api.catalog.*`), so these exercise the mapping + UI with wire-shape
 * rows (paise, bps, ISO dates, `active`) exactly as the main process sends them.
 */

const managerSession: SessionContextValue = {
  organizationId: 1,
  organizationSlug: 'demo-gym',
  organizationName: 'Demo Gym',
  userId: 1,
  userFullName: 'Priya Verma',
  userEmail: 'priya@demo.com',
  roleId: 1,
  roleName: 'Manager',
  isSuper: false,
  permissions: [
    'plan.view',
    'plan.create',
    'plan.update',
    'plan.deactivate',
    'offer.view',
    'offer.create',
    'offer.update',
    'offer.deactivate'
  ],
  onSignOut: vi.fn()
}

function planRow(id: number, name: string): PlanRow {
  return {
    id,
    name,
    description: `${name} description`,
    duration: 'MONTHLY',
    billingFrequency: 'ONE_TIME',
    basePriceMinor: 220000,
    accessWindow: 'ALL_HOURS',
    startTime: '06:00',
    endTime: '23:00',
    taxCode: 'GST18',
    taxRateBps: 1800,
    registrationFeeMinor: 50000,
    freezePolicyId: 1,
    prorationPolicyId: 2,
    cancellationPolicyId: 3,
    isActive: true,
    createdAt: new Date().toISOString()
  }
}

function offerRow(id: number, name: string, active = true): OfferRow {
  return {
    id,
    name,
    description: `${name} description`,
    discountType: 'PERCENTAGE',
    valueMinor: 20,
    applicablePlanIds: [],
    eligibility: null,
    validFrom: '2026-01-01',
    validTo: null,
    maxUsage: 100,
    minPurchaseMinor: 0,
    active,
    usedCount: 4,
    createdAt: new Date().toISOString()
  }
}

function versionRow(id: number, planId: number, basePriceMinor: number): PlanVersionRow {
  return {
    id,
    planId,
    basePriceMinor,
    taxRateBps: 1800,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

function offerVersionRow(
  id: number,
  offerId: number,
  discountType: OfferRow['discountType'],
  valueMinor: number
): OfferVersionRow {
  return {
    id,
    offerId,
    discountType,
    valueMinor,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
}

function renderPage(page: React.ReactElement): ReturnType<typeof renderWithClient> {
  return renderWithClient(
    <MemoryRouter>
      <TooltipProvider>
        <SessionProvider value={managerSession} onSignOut={vi.fn()}>
          {page}
        </SessionProvider>
      </TooltipProvider>
    </MemoryRouter>
  )
}

describe('PlansPage', () => {
  it('renders the catalog with tax and registration columns from wire rows', async () => {
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    renderPage(<PlansPage />)

    await screen.findByText('Annual Premium')
    expect(screen.getByText('GST18 · 18%')).toBeInTheDocument()
    expect(screen.getByText('₹500.00')).toBeInTheDocument()
  })

  it('edits a plan and sends tax/registration fields converted to wire units', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    vi.mocked(window.api.catalog.updatePlan).mockResolvedValue(planRow(1, 'Annual Premium'))
    renderPage(<PlansPage />)

    await screen.findByText('Annual Premium')
    await user.click(screen.getByRole('button', { name: 'Edit Annual Premium' }))

    const dialog = await screen.findByRole('dialog', { name: /Edit plan/ })
    expect(within(dialog).getByLabelText(/Tax code/)).toHaveValue('GST18')
    expect(within(dialog).getByLabelText(/Tax rate/)).toHaveValue(18)
    expect(within(dialog).getByLabelText(/Registration fee/)).toHaveValue('500')

    await user.clear(within(dialog).getByLabelText(/Tax rate/))
    await user.type(within(dialog).getByLabelText(/Tax rate/), '12')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(window.api.catalog.updatePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 1,
          taxCode: 'GST18',
          taxRateBps: 1200,
          registrationFeeMinor: 50000
        })
      )
    })
  })

  it('opens the price history dialog and lists captured versions', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    vi.mocked(window.api.catalog.listPlanVersions).mockResolvedValue([
      versionRow(1, 1, 200000),
      versionRow(2, 1, 220000)
    ])
    renderPage(<PlansPage />)

    await screen.findByText('Annual Premium')
    await user.click(screen.getByRole('button', { name: 'Price history for Annual Premium' }))

    await screen.findByRole('dialog', { name: /Annual Premium — price history/ })
    expect(window.api.catalog.listPlanVersions).toHaveBeenCalledWith({ planId: 1 })
    const historyDialog = screen.getByRole('dialog', { name: /Annual Premium — price history/ })
    expect(await within(historyDialog).findByText('₹2,000.00')).toBeInTheDocument()
    expect(within(historyDialog).getByText('₹2,200.00')).toBeInTheDocument()
  })
})

describe('OffersPage', () => {
  it('renders offers with open-ended dates and derived usage', async () => {
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    vi.mocked(window.api.catalog.listOffers).mockResolvedValue([
      offerRow(1, 'New Year Offer'),
      { ...offerRow(2, 'Limited Run'), maxUsage: null }
    ])
    renderPage(<OffersPage />)

    await screen.findByText('New Year Offer')
    expect(screen.getAllByText(/→\s*Open/)).toHaveLength(2)
    expect(screen.getByText('4 used')).toBeInTheDocument()
  })

  it('deactivates an offer after confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    vi.mocked(window.api.catalog.listOffers).mockResolvedValue([offerRow(1, 'Flash Sale')])
    vi.mocked(window.api.catalog.deactivateOffer).mockResolvedValue(undefined)
    renderPage(<OffersPage />)

    await screen.findByText('Flash Sale')
    await user.click(screen.getByRole('button', { name: 'Deactivate Flash Sale' }))

    const dialog = await screen.findByRole('alertdialog')
    await user.click(await within(dialog).findByRole('button', { name: 'Deactivate' }))

    await waitFor(() => {
      expect(window.api.catalog.deactivateOffer).toHaveBeenCalledWith({ offerId: 1 })
    })
  })

  it('opens the discount history dialog and lists captured versions', async () => {
    const user = userEvent.setup()
    vi.mocked(window.api.catalog.listPlans).mockResolvedValue([planRow(1, 'Annual Premium')])
    vi.mocked(window.api.catalog.listOffers).mockResolvedValue([offerRow(1, 'Flash Sale')])
    vi.mocked(window.api.catalog.listOfferVersions).mockResolvedValue([
      offerVersionRow(1, 1, 'PERCENTAGE', 20),
      offerVersionRow(2, 1, 'FIXED_AMOUNT', 50000)
    ])
    renderPage(<OffersPage />)

    await screen.findByText('Flash Sale')
    await user.click(screen.getByRole('button', { name: 'Discount history for Flash Sale' }))

    await screen.findByRole('dialog', { name: /Flash Sale — discount history/ })
    expect(window.api.catalog.listOfferVersions).toHaveBeenCalledWith({ offerId: 1 })
    const historyDialog = screen.getByRole('dialog', { name: /Flash Sale — discount history/ })
    expect(await within(historyDialog).findByText('20%')).toBeInTheDocument()
    expect(within(historyDialog).getByText('−₹500.00')).toBeInTheDocument()
  })
})
