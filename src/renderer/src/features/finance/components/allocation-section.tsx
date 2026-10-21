import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { Label } from '@/components/ui/label'
import type { FinanceInvoice } from '../types'

export interface AllocationDraft {
  invoiceId: string
  amountMinor: number
  enabled: boolean
}

interface AllocationSectionProps {
  invoices: FinanceInvoice[]
  paymentAmountMinor: number
  allocations: AllocationDraft[]
  onAllocationsChange: Dispatch<SetStateAction<AllocationDraft[]>>
  isLoading: boolean
}

function invoiceDue(inv: FinanceInvoice): number {
  return inv.status === 'VOID' ? 0 : Math.max(0, inv.totalMinor - inv.paidMinor)
}

/**
 * Standalone allocation section for the Record Payment dialog.
 *
 * Shows each outstanding invoice as a card with a toggle checkbox and a
 * read-only display of how much is allocated. The allocation amounts are
 * driven by the parent's Amount field — not by per-invoice inputs. All
 * amounts are integer minor units.
 */
export function AllocationSection({
  invoices,
  paymentAmountMinor,
  allocations,
  onAllocationsChange,
  isLoading
}: AllocationSectionProps): React.JSX.Element {
  const currency = useCurrency()
  const sorted = useMemo(
    () =>
      [...invoices]
        .filter((i) => i.status === 'OPEN' || i.status === 'PARTIALLY_PAID')
        .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()),
    [invoices]
  )

  const getDraft = useMemo(
    () =>
      (invoiceId: string): AllocationDraft | undefined =>
        allocations.find((a) => a.invoiceId === invoiceId),
    [allocations]
  )

  const toggleInvoice = (invoice: FinanceInvoice, checked: boolean): void => {
    const due = invoiceDue(invoice)
    const existing = allocations.find((a) => a.invoiceId === invoice.id)
    if (checked) {
      const otherAllocated = allocations
        .filter((a) => a.enabled && a.invoiceId !== invoice.id)
        .reduce((s, a) => s + (a.amountMinor || 0), 0)
      const available = Math.max(0, paymentAmountMinor - otherAllocated)
      const amountMinor = Math.min(due, available)
      if (existing) {
        onAllocationsChange(
          allocations.map((a) =>
            a.invoiceId === invoice.id ? { ...a, enabled: true, amountMinor } : a
          )
        )
        return
      }
      onAllocationsChange([...allocations, { invoiceId: invoice.id, amountMinor, enabled: true }])
      return
    }
    if (existing) {
      onAllocationsChange(
        allocations.map((a) =>
          a.invoiceId === invoice.id ? { ...a, enabled: false, amountMinor: 0 } : a
        )
      )
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">Loading outstanding invoices…</p>
      </div>
    )
  }

  if (!sorted.length) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            No outstanding invoices — this will record an advance payment.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Allocate across outstanding invoices
        </Label>
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((invoice) => {
          const due = invoiceDue(invoice)
          const draft = getDraft(invoice.id)
          const enabled = draft?.enabled ?? false
          const allocatedAmount = draft?.amountMinor ?? 0
          const progress = due > 0 ? Math.min(1, allocatedAmount / due) : 0

          return (
            <div
              key={invoice.id}
              className={cn(
                'rounded-md border bg-card transition-colors',
                enabled ? 'border-primary/40' : 'border-border'
              )}
            >
              {/* Top row: checkbox + invoice info + allocated amount */}
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <div
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                    enabled
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40 bg-background'
                  )}
                  onClick={(e) => {
                    e.preventDefault()
                    toggleInvoice(invoice, !enabled)
                  }}
                >
                  {enabled && <Check className="size-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold tabular-nums">
                    {invoice.invoiceNo}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{invoice.line}</p>
                </div>
                {enabled ? (
                  <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                    {formatMinor(allocatedAmount, currency)}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-bold tabular-nums text-amber-700 dark:text-amber-500">
                    {formatMinor(due, currency)} due
                  </span>
                )}
              </label>

              {/* Progress bar */}
              {enabled && (
                <div className="border-t border-border/60 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold tabular-nums text-amber-700 dark:text-amber-500">
                      {formatMinor(allocatedAmount, currency)} of {formatMinor(due, currency)}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-medium tabular-nums',
                        progress >= 1
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-amber-600 dark:text-amber-400'
                      )}
                    >
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300 ease-out',
                        progress >= 1
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-amber-500 dark:bg-amber-400'
                      )}
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
