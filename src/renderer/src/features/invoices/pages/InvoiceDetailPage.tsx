import { useState } from 'react'
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  Download,
  Mail,
  Phone,
  ReceiptText,
  Undo2,
  UserRound,
  UserRoundPen,
  Wallet
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'
import { formatDate, formatDateTime, initials } from '@/lib/format'
import { formatMinor, formatRate } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { PAYMENT_METHOD_META, type PaymentMethod } from '@/lib/payment-methods'
import { can, useSession } from '@/context/session-context'
import { RecordPaymentDialog } from '@/features/finance/components/record-payment-dialog'
import { pdfApi } from '@/features/pdf/api'
import { INVOICE_STATUS_META } from '../constants'
import { useInvoice } from '../queries'
import type { Invoice } from '../types'
import { InvoiceStatusBadge } from '../components/invoice-status-badge'
import { EditBillingSnapshotDialog } from '../components/edit-billing-snapshot-dialog'
import { MarkUncollectibleDialog, VoidInvoiceDialog } from '../components/lifecycle-reason-dialogs'

/* -------------------------------------------------------------------------- */
/*  Shared sub-components                                                      */
/* -------------------------------------------------------------------------- */

function SectionHeading({
  icon: Icon,
  title,
  hint
}: {
  icon: React.ComponentType<{ className?: string }>
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
  const gradient =
    tone === 'danger'
      ? { start: 'var(--destructive)', end: 'var(--warning)' }
      : tone === 'accent'
        ? { start: 'var(--primary)', end: 'var(--primary)' }
        : null
  return (
    <div
      className={cn(
        'crm-gradient-border flex flex-1 flex-col gap-1 rounded-md border border-border bg-card px-3 py-2.5'
      )}
      style={
        gradient
          ? ({
              '--gradient-start': gradient.start,
              '--gradient-end': gradient.end
            } as React.CSSProperties)
          : undefined
      }
    >
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span
        className={
          tone === 'danger'
            ? 'truncate text-sm font-semibold tabular-nums text-destructive'
            : tone === 'accent'
              ? 'truncate text-sm font-semibold tabular-nums text-primary'
              : 'truncate text-sm font-semibold tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Line items table                                                           */
/* -------------------------------------------------------------------------- */

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
            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-4 border-t border-border/60 px-3 py-2.5"
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
      <div className="flex flex-col items-end gap-1 pt-2">
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

/* -------------------------------------------------------------------------- */
/*  Payment allocations                                                        */
/* -------------------------------------------------------------------------- */

function AllocationRows({ invoice }: { invoice: Invoice }): React.JSX.Element {
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

/* -------------------------------------------------------------------------- */
/*  Refund rows                                                                 */
/* -------------------------------------------------------------------------- */

function RefundRows({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const currency = useCurrency()
  if (invoice.refunds.length === 0) {
    return <p className="text-sm text-muted-foreground">No refunds issued against this invoice.</p>
  }
  return (
    <div>
      {invoice.refunds.map((r) => {
        const meta = PAYMENT_METHOD_META[r.method as PaymentMethod] ?? PAYMENT_METHOD_META.OTHER
        const Icon = meta.icon
        return (
          <div
            key={r.id}
            className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm font-semibold tabular-nums">{r.refundNo}</p>
                <span className="font-mono text-[11px] text-muted-foreground">
                  against {r.sourcePaymentNo}
                </span>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">{r.reason}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold text-destructive tabular-nums">
                −{formatMinor(r.amountMinor, currency)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.refundDate)}</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Export refund receipt for ${r.refundNo}`}
              onClick={async () => {
                try {
                  const filePath = await pdfApi.exportRefund(r.id, 'preview')
                  toast.success('Refund receipt exported', {
                    description: `Saved to ${filePath}`
                  })
                } catch (err) {
                  toast.error('Export failed', {
                    description: err instanceof Error ? err.message : 'Could not generate receipt'
                  })
                }
              }}
            >
              <Download className="size-3.5" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Lifecycle action button                                                    */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/*  Loading skeleton                                                           */
/* -------------------------------------------------------------------------- */

function InvoiceDetailSkeleton(): React.JSX.Element {
  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <Skeleton className="mb-4 h-8 w-64" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        <Skeleton className="h-12 md:col-span-7" />
        <Skeleton className="h-12 md:col-span-5" />
        <Skeleton className="h-64 md:col-span-7" />
        <Skeleton className="h-64 md:col-span-5" />
        <Skeleton className="h-48 md:col-span-7" />
        <Skeleton className="h-48 md:col-span-5" />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Main page                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Invoice detail page (Module 04 / 09 §62) — full-page routed view of one
 * invoice. Bento grid layout:
 *
 *   Header: Back + InvoiceNo + StatusBadge + Actions
 *   Row 1: Line Items (7) | Customer Info (5)
 *   Row 2: Payments (7)   | Invoice Details (5)
 */
export function InvoiceDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const session = useSession()
  const currency = useCurrency()
  const { data: invoice, isLoading, isError } = useInvoice(id)

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [uncollectibleOpen, setUncollectibleOpen] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/invoices'
  const backLabel = from === '/customers' ? 'Customer' : 'Invoices'

  const meta = invoice ? INVOICE_STATUS_META[invoice.status] : undefined
  const isDraft = invoice?.status === 'DRAFT'
  const isOpenish = invoice?.status === 'OPEN' || invoice?.status === 'PARTIALLY_PAID'
  const isTerminal =
    invoice?.status === 'PAID' || invoice?.status === 'VOID' || invoice?.status === 'UNCOLLECTIBLE'
  const canEditSnapshot = can(session.permissions, session.isSuper, 'invoice.create')
  const canLifecycle = can(session.permissions, session.isSuper, 'invoice.void')
  const numericId = id ? Number(id) : undefined

  if (isLoading) return <InvoiceDetailSkeleton />

  if (isError || !invoice) {
    return (
      <div className="flex w-full items-center justify-center p-6">
        <EmptyState
          icon={ReceiptText}
          title="Invoice not found"
          description="This invoice may have been removed or the link is invalid."
          action={
            <Button onClick={() => navigate(from)}>
              <ArrowLeft />
              Back to {backLabel.toLowerCase()}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={from}>
            <Button variant="ghost" size="sm">
              <ArrowLeft />
              {backLabel}
            </Button>
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading font-mono text-xl font-semibold tracking-tight">
              {invoice.invoiceNo}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDraft ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={canEditSnapshot ? -1 : 0} className="contents">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canEditSnapshot}
                      onClick={() => setSnapshotOpen(true)}
                    >
                      <UserRoundPen className="size-4" />
                      Edit billing
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canEditSnapshot ? (
                  <TooltipContent>Requires the invoice.create permission</TooltipContent>
                ) : null}
              </Tooltip>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast('Continue draft', {
                    description: 'Reopen the draft from the register to add lines and finalize.'
                  })
                }
              >
                Add lines / Finalize
              </Button>
            </>
          ) : isOpenish ? (
            <>
              <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
                Record payment
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const filePath = await pdfApi.exportInvoice(numericId!, 'preview')
                    toast.success('PDF exported', {
                      description: `Opened in system viewer. Also saved to ${filePath}`
                    })
                  } catch (err) {
                    toast.error('Export failed', {
                      description: err instanceof Error ? err.message : 'Could not generate PDF'
                    })
                  }
                }}
              >
                <Download className="size-4" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
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
            </>
          ) : isTerminal ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const filePath = await pdfApi.exportInvoice(numericId!, 'preview')
                    toast.success('PDF exported', {
                      description: `Opened in system viewer. Also saved to ${filePath}`
                    })
                  } catch (err) {
                    toast.error('Export failed', {
                      description: err instanceof Error ? err.message : 'Could not generate PDF'
                    })
                  }
                }}
              >
                <Download className="size-4" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  toast('Email invoice', {
                    description: 'Email delivery arrives with the Reports module.'
                  })
                }
              >
                Email invoice
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Stat tiles ─────────────────────────────────────────────────── */}
      <div className="flex gap-2.5">
        <StatTile
          label="Total"
          value={formatMinor(invoice.totalMinor, currency)}
          tone={
            invoice.status === 'VOID' || invoice.status === 'UNCOLLECTIBLE' ? 'muted' : 'accent'
          }
        />
        <StatTile
          label="Paid"
          value={formatMinor(invoice.paidMinor, currency)}
          tone={invoice.paidMinor > 0 ? 'accent' : 'muted'}
        />
        <StatTile
          label="Outstanding"
          value={formatMinor(invoice.outstandingMinor, currency)}
          tone={invoice.outstandingMinor > 0 ? 'danger' : 'muted'}
        />
      </div>

      {/* ── Bento grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
        {/* ── Main column: Line items (7) ─────────────────────────────── */}
        <section
          className="crm-gradient-border flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm md:col-span-7"
          style={
            {
              '--gradient-start': 'var(--primary)',
              '--gradient-end': 'var(--primary)'
            } as React.CSSProperties
          }
        >
          <SectionHeading
            icon={ReceiptText}
            title="Line items"
            hint={
              <span className="text-xs text-muted-foreground tabular-nums">
                {meta?.label} · {invoice.lines.length}{' '}
                {invoice.lines.length === 1 ? 'line' : 'lines'}
              </span>
            }
          />
          <InvoiceLines invoice={invoice} />
        </section>

        {/* ── Side column: Customer info (5) ──────────────────────────── */}
        <section
          className="crm-gradient-border flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm md:col-span-5"
          style={
            {
              '--gradient-start': 'var(--violet)',
              '--gradient-end': 'var(--primary)'
            } as React.CSSProperties
          }
        >
          {/* Customer header */}
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-heading text-sm font-semibold text-primary">
              {initials(invoice.customer.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{invoice.customer.name}</p>
              <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {invoice.customer.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 shrink-0" />
                    {invoice.customer.phone}
                  </span>
                )}
                {invoice.customer.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{invoice.customer.email}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Billing snapshot (if different from customer) */}
          {(invoice.billingName ||
            invoice.billingPhone ||
            invoice.billingEmail ||
            invoice.billingAddress) && (
            <>
              <div className="h-px bg-border/60" />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Billing snapshot
                </span>
                {invoice.billingName && <KeyValue label="Name" value={invoice.billingName} />}
                {invoice.billingPhone && <KeyValue label="Phone" value={invoice.billingPhone} />}
                {invoice.billingEmail && <KeyValue label="Email" value={invoice.billingEmail} />}
                {invoice.billingAddress && (
                  <KeyValue label="Address" value={invoice.billingAddress} />
                )}
              </div>
            </>
          )}
        </section>

        {/* ── Main column: Payments allocated (7) ─────────────────────── */}
        <section
          className="crm-gradient-border flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm md:col-span-7"
          style={
            {
              '--gradient-start': 'var(--success)',
              '--gradient-end': 'var(--primary)'
            } as React.CSSProperties
          }
        >
          <SectionHeading
            icon={Wallet}
            title="Payments allocated"
            hint={
              <span className="text-xs text-muted-foreground tabular-nums">
                {invoice.allocations.length}{' '}
                {invoice.allocations.length === 1 ? 'payment' : 'payments'}
              </span>
            }
          />
          <AllocationRows invoice={invoice} />
        </section>

        {/* ── Refunds section ─────────────────────────────────────────── */}
        <section
          className="crm-gradient-border flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm md:col-span-7"
          style={
            {
              '--gradient-start': 'var(--destructive)',
              '--gradient-end': 'var(--destructive)'
            } as React.CSSProperties
          }
        >
          <SectionHeading
            icon={Undo2}
            title="Refunds issued"
            hint={
              <span className="text-xs text-muted-foreground tabular-nums">
                {invoice.refunds.length} {invoice.refunds.length === 1 ? 'refund' : 'refunds'}
              </span>
            }
          />
          <RefundRows invoice={invoice} />
        </section>

        {/* ── Side column: Invoice details (5) ────────────────────────── */}
        <section
          className="crm-gradient-border flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm md:col-span-5"
          style={
            {
              '--gradient-start': 'var(--primary)',
              '--gradient-end': 'var(--primary)'
            } as React.CSSProperties
          }
        >
          <SectionHeading icon={CalendarClock} title="Details" />
          <div>
            <KeyValue label="Issued" value={formatDate(invoice.issuedAt)} />
            {invoice.dueAt ? <KeyValue label="Due" value={formatDate(invoice.dueAt)} /> : null}
            <KeyValue label="Status" value={meta?.label ?? invoice.status} />
            <KeyValue
              label="Created by"
              value={
                <span className="flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-muted-foreground" />
                  {invoice.createdBy}
                </span>
              }
            />
          </div>
        </section>
      </div>

      {/* ── Sub-dialogs ────────────────────────────────────────────────── */}
      {isDraft ? (
        <EditBillingSnapshotDialog
          open={snapshotOpen}
          onOpenChange={setSnapshotOpen}
          invoiceId={numericId}
          invoiceNo={invoice.invoiceNo}
          initial={{
            name: invoice.billingName ?? invoice.customer.name,
            phone: invoice.billingPhone ?? '',
            email: invoice.billingEmail ?? '',
            address: invoice.billingAddress ?? ''
          }}
        />
      ) : null}
      {isOpenish ? (
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
      <RecordPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        preSelectedCustomerId={invoice.customer.id}
        preSelectedInvoiceId={invoice.id}
      />
    </div>
  )
}
