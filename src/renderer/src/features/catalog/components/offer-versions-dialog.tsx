import { History, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useOfferVersions } from '../queries'
import { discountBadgeText } from '../pricing'
import { formatDate } from '../format'
import { useCurrency } from '@/hooks/use-currency'
import type { Offer } from '../types'

/**
 * Discount history for an offer. Every edit that changes the discount type or
 * value writes an `offer_versions` row capturing the outgoing values, so the
 * past discount of an offer is always auditable — invoices still reference their
 * sale-time snapshot, not these.
 */
export function OfferVersionsDialog({
  offer,
  open,
  onOpenChange
}: {
  offer: Offer | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { data: versions = [], isLoading } = useOfferVersions(offer?.id ?? null)
  const currency = useCurrency()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            {offer?.name} — discount history
          </DialogTitle>
          <DialogDescription>
            Snapshots of the discount at each edit. Invoices keep the discount they were sold at.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-auto rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No recorded discount changes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {versions.map((v) => (
                  <tr key={v.id} className="odd:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium tabular-nums">
                      {discountBadgeText(v, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {formatDate(v.effectiveFrom)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
