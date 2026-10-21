import { useState } from 'react'
import { Download, Receipt, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { RecordPaymentDialog } from '@/features/finance/components/record-payment-dialog'
import { pdfApi } from '@/features/pdf/api'
import { formatShortDate } from '../../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { CustomerInvoice } from '../../types'

const STATUS_CFG: Record<CustomerInvoice['status'], { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  OPEN: {
    label: 'Open',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  },
  PARTIALLY_PAID: {
    label: 'Partially paid',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
  },
  PAID: {
    label: 'Paid',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
  },
  VOID: { label: 'Void', className: 'bg-muted text-muted-foreground line-through' },
  UNCOLLECTIBLE: { label: 'Uncollectible', className: 'bg-destructive/10 text-destructive' }
}

/**
 * Overview of ONE invoice (Module 04 snapshot): document number, status and the
 * subtotal → tax → total breakdown with the paid/outstanding split. Values are
 * finished rupees from the read model — this component never does arithmetic.
 */
export function InvoiceOverviewCard({
  invoice,
  customerId,
  className
}: {
  invoice: CustomerInvoice
  customerId: string
  className?: string
}): React.JSX.Element {
  const inv = invoice
  const currency = useCurrency()
  const cfg = STATUS_CFG[inv.status]
  const settled = inv.outstandingMinor <= 0 && inv.status !== 'VOID' && inv.status !== 'DRAFT'
  const [paymentOpen, setPaymentOpen] = useState(false)

  return (
    <>
      <div
        className={cn(
          'crm-gradient-border flex flex-col rounded-xl border bg-card p-5 shadow-sm',
          className
        )}
        style={
          {
            '--gradient-start': 'var(--warning)',
            '--gradient-end': 'var(--primary)'
          } as React.CSSProperties
        }
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold">
            <Receipt className="size-3.5 text-muted-foreground" /> {inv.invoiceNo}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.className}`}>
            {cfg.label}
          </span>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">Issued {formatShortDate(inv.issuedAt)}</p>

        <div className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Subtotal</span>
            <span className="font-mono tabular-nums">
              {formatMinor(inv.subtotalMinor, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Tax</span>
            <span className="font-mono tabular-nums">{formatMinor(inv.taxMinor, currency)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t pt-2">
            <span className="text-sm font-semibold tracking-tight">Total</span>
            <span className="font-mono text-base font-bold tabular-nums">
              {formatMinor(inv.totalMinor, currency)}
            </span>
          </div>
        </div>

        <div
          className={cn(
            'mt-3 flex items-center justify-between rounded-lg px-3 py-2 text-sm',
            settled
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
          )}
        >
          <span className="text-xs font-medium">
            {settled
              ? 'Paid in full ✓'
              : `Outstanding ${formatMinor(inv.outstandingMinor, currency)}`}
          </span>
          <span className="font-mono text-xs font-semibold tabular-nums">
            {formatMinor(inv.paidMinor, currency)} paid
          </span>
        </div>

        {!settled ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={() => setPaymentOpen(true)}
          >
            <Wallet className="mr-1.5 size-3.5" /> Make payment
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 w-full text-muted-foreground"
          onClick={async () => {
            try {
              const filePath = await pdfApi.exportInvoice(inv.id, 'preview')
              toast.success('PDF exported', {
                description: `Saved to ${filePath}`
              })
            } catch (err) {
              toast.error('Export failed', {
                description: err instanceof Error ? err.message : 'Could not generate PDF'
              })
            }
          }}
        >
          <Download className="mr-1.5 size-3.5" /> Export PDF
        </Button>
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        preSelectedCustomerId={customerId}
        preSelectedInvoiceId={inv.id}
      />
    </>
  )
}
