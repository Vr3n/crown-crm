import { History, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatMinor, formatRate } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { usePlanVersions } from '../queries'
import type { Plan } from '../types'
import { formatDate } from '../format'

/**
 * Price history for a plan. Every edit writes a `membership_plan_versions`
 * row capturing the old price/tax, so the past pricing of a plan is always
 * auditable — invoices still reference their sale-time snapshot, not these.
 */
export function PlanVersionsDialog({
  plan,
  open,
  onOpenChange
}: {
  plan: Plan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const { data: versions = [], isLoading } = usePlanVersions(plan?.id ?? null)
  const currency = useCurrency()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 text-primary" />
            {plan?.name} — price history
          </DialogTitle>
          <DialogDescription>
            Snapshots of the price at each edit. Memberships keep the price they were sold at.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-auto rounded-lg border">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading versions…
            </div>
          ) : versions.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No recorded price changes yet.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {versions.map((v) => (
                  <tr key={v.id} className="odd:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono font-medium tabular-nums">
                      {formatMinor(v.basePriceMinor, currency)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground tabular-nums">
                      {v.taxRateBps > 0 ? formatRate(v.taxRateBps) : '—'}
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
