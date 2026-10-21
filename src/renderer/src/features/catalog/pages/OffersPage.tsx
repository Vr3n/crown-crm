import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { useSession } from '@/context/session-context'
import { filterOffersByLifecycle } from '../pricing'
import { useDeactivateOffer, useOffers, usePlans } from '../queries'
import type { Offer } from '../types'
import { ConfirmDeleteDialog } from '../components/confirm-delete-dialog'
import { OfferFilters, type OfferFiltersState } from '../components/offer-filters'
import { OfferFormDialog } from '../components/offer-form-dialog'
import { OfferMetrics } from '../components/offer-metrics'
import { OfferTable } from '../components/offer-table'
import { OfferVersionsDialog } from '../components/offer-versions-dialog'

const DEFAULT_FILTERS: OfferFiltersState = {
  search: '',
  lifecycle: 'ALL',
  discountType: 'ALL',
  dateRange: undefined
}

type DialogState = { mode: 'new' } | { mode: 'edit'; offer: Offer } | null

/**
 * Offers (Module 03 · Catalog) — pricing rules layered on plans. The discount
 * math is snapshotted onto the Membership/Invoice at sale time, so historical
 * invoices keep their own price even when an offer changes.
 */
export function OffersPage(): React.JSX.Element {
  const session = useSession()
  const { data: offers = [], isLoading } = useOffers()
  const { data: plans = [] } = usePlans()
  const [filters, setFilters] = useState<OfferFiltersState>(DEFAULT_FILTERS)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [deactivating, setDeactivating] = useState<Offer | null>(null)
  const [historyOffer, setHistoryOffer] = useState<Offer | null>(null)
  const deactivateOffer = useDeactivateOffer()

  const rows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase()
    return filterOffersByLifecycle(offers, filters.lifecycle)
      .filter(
        (offer) => filters.discountType === 'ALL' || offer.discountType === filters.discountType
      )
      .filter((offer) => {
        if (!filters.dateRange?.from && !filters.dateRange?.to) return true
        const offerStart = new Date(offer.startDate)
        const offerEnd = offer.endDate ? new Date(offer.endDate) : null
        if (filters.dateRange.from && offerEnd && offerEnd < filters.dateRange.from) return false
        if (filters.dateRange.to && offerStart > filters.dateRange.to) return false
        return true
      })
      .filter(
        (offer) =>
          needle.length === 0 ||
          offer.name.toLowerCase().includes(needle) ||
          offer.code.toLowerCase().includes(needle)
      )
  }, [offers, filters])

  const editingOffer = dialog?.mode === 'edit' ? dialog.offer : null

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <PageHeader
        title="Offers"
        description={`${session.organizationName} · pricing rules at sale time`}
        actions={
          <Button onClick={() => setDialog({ mode: 'new' })}>
            <Plus className="size-4" />
            New offer
          </Button>
        }
      />

      <OfferMetrics offers={rows} />

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-2.5">
          <OfferFilters filters={filters} onChange={setFilters} />
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardContent className="px-3 py-3">
          <OfferTable
            offers={rows}
            plans={plans}
            isLoading={isLoading}
            onEdit={(offer) => setDialog({ mode: 'edit', offer })}
            onDeactivate={setDeactivating}
            onHistory={setHistoryOffer}
          />
        </CardContent>
      </Card>

      <OfferFormDialog
        key={dialog ? (dialog.mode === 'edit' ? String(dialog.offer.id) : 'new') : 'closed'}
        offer={editingOffer}
        plans={plans}
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null)
        }}
      />

      <ConfirmDeleteDialog
        open={deactivating !== null}
        title={deactivating ? `Deactivate ${deactivating.name}?` : 'Deactivate offer?'}
        description="The offer stops applying to new sales immediately. Invoices that already used it keep their snapshot price."
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        isPending={deactivateOffer.isPending}
        onConfirm={() => {
          if (deactivating) {
            deactivateOffer.mutate(deactivating.id, { onSuccess: () => setDeactivating(null) })
          }
        }}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null)
        }}
      />

      <OfferVersionsDialog
        offer={historyOffer}
        open={historyOffer !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryOffer(null)
        }}
      />
    </div>
  )
}
