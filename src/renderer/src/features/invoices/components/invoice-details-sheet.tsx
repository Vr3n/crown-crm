import { useState } from 'react'
import {
  CalendarClock,
  Mail,
  Phone,
  ReceiptText,
  UserRound,
  UserRoundPen,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, initials } from '@/features/leads/format'
import { PAYMENT_METHOD_META, type PaymentMethod } from '@/lib/payment-methods'
import { formatMinor, formatRate } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { can, useSession } from '@/context/session-context'
import { RecordPaymentDialog } from '@/features/finance/components/record-payment-dialog'
import { INVOICE_STATUS_META } from '../constants'
import { useInvoice } from '../queries'
import type { Invoice } from '../types'
import { EditBillingSnapshotDialog } from './edit-billing-snapshot-dialog'
import { MarkUncollectibleDialog, VoidInvoiceDialog } from './lifecycle-reason-dialogs'
import { InvoiceStatusBadge } from './invoice-status-badge'

/**
 * Invoice drawer opened from a register row ("View" or row click). Shows the
 * immutable billing snapshot — lines with per-line tax (Module 04 §14), the
 * derived totals and the payments allocated against it (Module 05 §16) — so a
 * front-desk staff member can see exactly what an invoice says without leaving
 * the register.
 */

function SectionHeading({
  icon: Icon,
  title,
  hint
}: {
  icon: LucideIcon
  title: string
  hint?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <h3 className="font-heading text-sm font-medium">{title}</h3>
      </div>
      {hint}
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone?: 'muted' | 'danger' | 'accent'
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        className={cn(
          'truncate text-sm font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'accent' && 'text-primary'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function AllocationRow({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const currency = useCurrency()
  if (invoice.allocations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No payments recorded against this invoice yet.
      </p>
    )
  }
  return (
    <div>
      {invoice.allocations.map((a) => {
        const meta = PAYMENT_METHOD_META[a.method as PaymentMethod] ?? PAYMENT_METHOD_META.OTHER
        const Icon = meta.icon
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {a.reference} · {a.receivedBy}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold tabular-nums">
                {formatMinor(a.amountMinor, currency)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(a.receivedAt)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InvoiceLines({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const currency = useCurrency()
  return (
    <>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 bg-muted/40 px-3 py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>Item</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Tax</span>
        </div>
        {invoice.lines.map((l) => (
          <div
            key={l.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 border-t border-border/60 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{l.description}</p>
              {l.discountMinor > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Discount {formatMinor(l.discountMinor, currency)}
                </p>
              ) : null}
            </div>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {l.quantity}
            </span>
            <span className="text-right text-xs tabular-nums">
              {formatMinor(l.unitPriceMinor, currency)}
            </span>
            <span className="text-right text-xs tabular-nums text-muted-foreground">
              {formatRate(l.taxRateBps)}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">
          Subtotal{' '}
          <span className="font-mono tabular-nums">
            {formatMinor(invoice.subtotalMinor, currency)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          Tax (GST){' '}
          <span className="font-mono tabular-nums">
            {formatMinor(invoice.taxTotalMinor, currency)}
          </span>
        </span>
        <span className="text-sm font-semibold">
          Total{' '}
          <span className="font-mono tabular-nums">
            {formatMinor(invoice.totalMinor, currency)}
          </span>
        </span>
      </div>
    </>
  )
}

function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function InvoiceSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="flex gap-2.5">
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
        <Skeleton className="h-16 flex-1" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-36 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

export function InvoiceDetailsSheet({
  invoice,
  open,
  onOpenChange
}: {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const session = useSession()
  const currency = useCurrency()
  // `invoice` stays set while `open` goes false so the content persists through
  // the close (exit) animation instead of flashing empty.
  const { data, isLoading, isError } = useInvoice(invoice?.id)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [uncollectibleOpen, setUncollectibleOpen] = useState(false)

  const meta = data ? INVOICE_STATUS_META[data.status] : undefined
  const isDraft = data?.status === 'DRAFT'
  const isOpenish = data?.status === 'OPEN' || data?.status === 'PARTIALLY_PAID'
  const canEditSnapshot = can(session.permissions, session.isSuper, 'invoice.create')
  const canLifecycle = can(session.permissions, session.isSuper, 'invoice.void')
  // The billing commands take the numeric row id; the read model uses strings.
  const numericId = invoice ? Number(invoice.id) : undefined

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
          {invoice && (
            <>
              <SheetHeader className="gap-3 border-b border-border/80 pr-12">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-heading text-sm font-semibold text-primary">
                    {initials(invoice.customer.name)}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="truncate text-lg">{invoice.customer.name}</SheetTitle>
                      {data ? <InvoiceStatusBadge status={data.status} /> : null}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {invoice.invoiceNo}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" />
                    {invoice.customer.phone ?? '—'}
                  </span>
                  {invoice.customer.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{invoice.customer.email}</span>
                    </span>
                  )}
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {isLoading ? (
                  <InvoiceSkeleton />
                ) : isError || !data ? (
                  <p className="text-sm text-muted-foreground">Couldn&apos;t load this invoice.</p>
                ) : (
                  <div className="flex flex-col gap-8">
                    <div className="flex gap-2.5">
                      <StatTile
                        label="Total"
                        value={formatMinor(data.totalMinor, currency)}
                        tone={
                          data.status === 'VOID' || data.status === 'UNCOLLECTIBLE'
                            ? 'muted'
                            : 'accent'
                        }
                      />
                      <StatTile
                        label="Paid"
                        value={formatMinor(data.paidMinor, currency)}
                        tone={data.paidMinor > 0 ? 'accent' : 'muted'}
                      />
                      <StatTile
                        label="Outstanding"
                        value={formatMinor(data.outstandingMinor, currency)}
                        tone={data.outstandingMinor > 0 ? 'danger' : 'muted'}
                      />
                    </div>

                    <section className="flex flex-col gap-3">
                      <SectionHeading
                        icon={ReceiptText}
                        title="Invoice lines"
                        hint={
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {meta?.label} · {data.lines.length}{' '}
                            {data.lines.length === 1 ? 'line' : 'lines'}
                          </span>
                        }
                      />
                      <InvoiceLines invoice={data} />
                    </section>

                    <section className="flex flex-col gap-3">
                      <SectionHeading icon={Wallet} title="Payments allocated" />
                      <AllocationRow invoice={data} />
                    </section>

                    <section className="flex flex-col gap-3">
                      <SectionHeading icon={CalendarClock} title="Details" />
                      <div>
                        <KeyValue label="Issued" value={formatDate(data.issuedAt)} />
                        {data.dueAt ? (
                          <KeyValue label="Due" value={formatDate(data.dueAt)} />
                        ) : null}
                        <KeyValue label="Status" value={meta?.label ?? data.status} />
                        <KeyValue
                          label="Created by"
                          value={
                            <span className="flex items-center gap-1.5">
                              <UserRound className="size-3.5 text-muted-foreground" />
                              {data.createdBy}
                            </span>
                          }
                        />
                      </div>
                    </section>
                  </div>
                )}
              </div>

              {isDraft ? (
                <SheetFooter className="border-t border-border/80">
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={canEditSnapshot ? -1 : 0} className="contents">
                          <Button
                            variant="outline"
                            disabled={!canEditSnapshot}
                            onClick={() => setSnapshotOpen(true)}
                          >
                            <UserRoundPen />
                            Edit billing details
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {!canEditSnapshot ? (
                        <TooltipContent>Requires the invoice.create permission</TooltipContent>
                      ) : null}
                    </Tooltip>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Continue draft', {
                          description:
                            'Reopen the draft from the register to add lines and finalize.'
                        })
                      }
                    >
                      Add lines / Finalize
                    </Button>
                  </div>
                </SheetFooter>
              ) : data && isOpenish ? (
                <SheetFooter className="border-t border-border/80">
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    <Button onClick={() => setPaymentDialogOpen(true)}>Record payment</Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Follow-up scheduled', {
                          description: 'Follow-up scheduling arrives with the Members module.'
                        })
                      }
                    >
                      Schedule follow-up
                    </Button>
                    <LifecycleButton
                      label="Void"
                      enabled={canLifecycle}
                      tooltip="Requires the invoice.void permission"
                      onClick={() => setVoidOpen(true)}
                    />
                    <LifecycleButton
                      label="Mark uncollectible"
                      enabled={canLifecycle}
                      tooltip="Requires the invoice.void permission"
                      onClick={() => setUncollectibleOpen(true)}
                    />
                  </div>
                </SheetFooter>
              ) : data != null &&
                (data.status === 'PAID' ||
                  data.status === 'VOID' ||
                  data.status === 'UNCOLLECTIBLE') ? (
                <SheetFooter className="border-t border-border/80">
                  <div className="grid w-full grid-cols-2 gap-2.5">
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Print / PDF', {
                          description: 'Printable invoices arrive with the Reports module.'
                        })
                      }
                    >
                      Print / PDF
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        toast('Email invoice', {
                          description: 'Email delivery arrives with the Reports module.'
                        })
                      }
                    >
                      Email invoice
                    </Button>
                  </div>
                </SheetFooter>
              ) : null}
            </>
          )}
        </SheetContent>
      </Sheet>
      {invoice && isDraft ? (
        <EditBillingSnapshotDialog
          open={snapshotOpen}
          onOpenChange={setSnapshotOpen}
          invoiceId={numericId}
          invoiceNo={invoice.invoiceNo}
          initial={{
            name: data.billingName ?? invoice.customer.name,
            phone: data.billingPhone ?? '',
            email: data.billingEmail ?? '',
            address: data.billingAddress ?? ''
          }}
        />
      ) : null}
      {invoice && isOpenish ? (
        <>
          <VoidInvoiceDialog
            open={voidOpen}
            onOpenChange={setVoidOpen}
            invoiceId={numericId}
            invoiceNo={invoice.invoiceNo}
          />
          <MarkUncollectibleDialog
            open={uncollectibleOpen}
            onOpenChange={setUncollectibleOpen}
            invoiceId={numericId}
            invoiceNo={invoice.invoiceNo}
          />
        </>
      ) : null}
      {invoice && (
        <RecordPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          preSelectedCustomerId={invoice.customer.id}
          preSelectedInvoiceId={invoice.id}
        />
      )}
    </>
  )
}

/** Lifecycle action that degrades to a disabled button + permission tooltip. */
function LifecycleButton({
  label,
  enabled,
  tooltip,
  onClick
}: {
  label: string
  enabled: boolean
  tooltip: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={enabled ? -1 : 0}>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={!enabled}
            onClick={onClick}
          >
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      {!enabled ? <TooltipContent>{tooltip}</TooltipContent> : null}
    </Tooltip>
  )
}
