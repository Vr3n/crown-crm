import { HandCoins, Mail, Phone, ReceiptText, UserRound, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatDateTime, formatTime, initials } from '@/features/leads/format'
import { PAYMENT_METHOD_META } from '@/lib/payment-methods'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { usePayment } from '../queries'
import type { PaymentRecord } from '../types'

/**
 * Payment drawer opened from the ledger row ("View" / row click). A payment is
 * money that arrived — immutable — so the sheet shows the method + counterfoil
 * reference, who recorded it, and the invoice(s) it was allocated against
 * ("On account" when it floats).
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

function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function PaymentSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3.5 w-44" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  )
}

export function PaymentDetailsSheet({
  payment,
  open,
  onOpenChange
}: {
  payment: PaymentRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  // `payment` stays set while `open` goes false so the content persists through
  // the close (exit) animation instead of flashing empty.
  const { data, isLoading, isError } = usePayment(payment?.id)
  const currency = useCurrency()

  const meta = data ? PAYMENT_METHOD_META[data.method] : undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {payment && (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {initials(payment.customer.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate text-lg">{payment.customer.name}</SheetTitle>
                    {data ? (
                      <Badge
                        variant="secondary"
                        className="rounded-none px-2.5 py-1 text-xs font-medium"
                      >
                        {meta?.label}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {payment.reference}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" />
                  {payment.customer.phone ?? '—'}
                </span>
                {payment.customer.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{payment.customer.email}</span>
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {isLoading ? (
                <PaymentSkeleton />
              ) : isError || !data ? (
                <p className="text-sm text-muted-foreground">Couldn&apos;t load this payment.</p>
              ) : (
                <div className="flex flex-col gap-8">
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3">
                    <span className="text-sm text-muted-foreground">Amount received</span>
                    <span className="font-mono text-2xl font-bold tabular-nums text-primary">
                      {formatMinor(data.amountMinor, currency)}
                    </span>
                  </div>

                  <section className="flex flex-col gap-3">
                    <SectionHeading icon={HandCoins} title="Payment" />
                    <div>
                      <KeyValue label="Reference" value={data.reference} />
                      <KeyValue
                        label="Received at"
                        value={`${formatDateTime(data.receivedAt)} · ${formatTime(data.receivedAt)}`}
                      />
                      <KeyValue
                        label="Recorded by"
                        value={
                          <span className="flex items-center gap-1.5">
                            <UserRound className="size-3.5 text-muted-foreground" />
                            {data.receivedBy}
                          </span>
                        }
                      />
                    </div>
                  </section>

                  <section className="flex flex-col gap-3">
                    <SectionHeading icon={ReceiptText} title="Allocated to" />
                    {data.allocations.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border p-4">
                        <p className="text-sm font-medium text-primary">On account</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {data.notes ?? 'Advance payment — allocated to future invoices.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        {data.allocations.map((a) => (
                          <div
                            key={`${a.invoiceNo}-${a.amountMinor}`}
                            className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-0"
                          >
                            <span className="font-mono text-sm font-medium tabular-nums">
                              {a.invoiceNo}
                            </span>
                            <span className="text-sm font-semibold tabular-nums">
                              {formatMinor(a.amountMinor, currency)}
                            </span>
                          </div>
                        ))}
                        {data.notes ? (
                          <p className="pt-2 text-xs text-muted-foreground">{data.notes}</p>
                        ) : null}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
