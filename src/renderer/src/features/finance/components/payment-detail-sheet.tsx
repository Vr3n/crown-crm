import { ArrowRightLeft, BadgeCheck, CircleCheck, ReceiptText, Undo2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, initials } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import { ALLOCATION_STATUS_META } from '../constants'
import { allocatedAmount, allocationStatusOf, unallocatedAmount } from '../build'
import { PaymentMethodBadge } from './payment-method-badge'
import type { Payment, Refund } from '../types'

function KeyValue({
  label,
  value,
  destructive
}: {
  label: string
  value: React.ReactNode
  destructive?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium', destructive && 'text-destructive')}>{value}</span>
    </div>
  )
}

function SectionHeading({
  icon: Icon,
  title
}: {
  icon: typeof Undo2
  title: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <h3 className="font-heading text-sm font-medium">{title}</h3>
    </div>
  )
}

/**
 * Payment record drawer (Module 05 §15–16). Shows the money as it was received
 * (never edited), the explicit allocations across invoices, and any refunds
 * layered on top — with the net cash retained spelled out.
 */
export function PaymentDetailSheet({
  payment,
  refunds,
  open,
  onOpenChange
}: {
  payment: Payment | null
  refunds: Refund[]
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  // `payment` stays set while `open` goes false, so the content persists
  // through the close (exit) animation instead of flashing empty.
  const status = payment ? allocationStatusOf(payment) : null
  const statusMeta = status ? ALLOCATION_STATUS_META[status] : null
  const currency = useCurrency()
  const allocated = payment ? allocatedAmount(payment) : 0
  const unallocated = payment ? unallocatedAmount(payment) : 0
  const paymentRefunds = payment ? refunds.filter((r) => payment.refundIds.includes(r.id)) : []
  const refunded = paymentRefunds.reduce((s, r) => s + r.amountMinor, 0)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {payment && status && statusMeta ? (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-semibold text-primary">
                  {initials(payment.customer.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="font-mono text-lg tabular-nums">
                      {payment.paymentNo}
                    </SheetTitle>
                    <Badge variant={statusMeta.tone} className="shrink-0">
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <p className="truncate text-sm font-medium">{payment.customer.name}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between rounded-md border border-border bg-card px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Amount received</span>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatMinor(payment.amountMinor, currency)}
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-7 divide-y divide-border/60">
                <section className="flex flex-col gap-3">
                  <SectionHeading icon={ArrowRightLeft} title="Details" />
                  <div>
                    <KeyValue label="Date" value={formatDate(payment.paymentDate)} />
                    <KeyValue
                      label="Method"
                      value={<PaymentMethodBadge method={payment.method} />}
                    />
                    <KeyValue
                      label="Reference"
                      value={
                        payment.reference ? (
                          <span className="font-mono text-xs">{payment.reference}</span>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <KeyValue label="Recorded by" value={payment.createdBy} />
                    <KeyValue
                      label="Allocated"
                      value={
                        <span className="font-mono text-xs tabular-nums">
                          {formatMinor(allocated, currency)}
                          {unallocated > 0 ? (
                            <span className="text-muted-foreground">
                              {' '}
                              · {formatMinor(unallocated, currency)} unallocated
                            </span>
                          ) : null}
                        </span>
                      }
                    />
                  </div>
                </section>

                <section className="flex flex-col gap-3 pt-5">
                  <SectionHeading icon={ReceiptText} title="Allocations" />
                  {payment.allocations.length ? (
                    <div className="flex flex-col gap-2">
                      {payment.allocations.map((a) => (
                        <div
                          key={a.invoiceId}
                          className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
                            <BadgeCheck className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold tabular-nums">
                              {a.invoiceNo}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              Applied toward this invoice
                            </p>
                          </div>
                          <span className="font-mono text-sm font-semibold tabular-nums">
                            {formatMinor(a.amountMinor, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Nothing allocated yet — an advance payment awaiting an invoice.
                    </p>
                  )}
                </section>

                <section className="flex flex-col gap-3 pt-5">
                  <SectionHeading icon={Undo2} title="Refunds on this payment" />
                  {paymentRefunds.length ? (
                    <div className="flex flex-col gap-2">
                      {paymentRefunds.map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-3 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5"
                        >
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                            <CircleCheck className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold tabular-nums">
                              {r.refundNo}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{r.reason}</p>
                          </div>
                          <span className="font-mono text-sm font-semibold text-destructive tabular-nums">
                            −{formatMinor(r.amountMinor, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No refunds issued against this payment.
                    </p>
                  )}
                </section>

                {payment.notes ? (
                  <section className="pt-5">
                    <p className="text-sm text-muted-foreground">{payment.notes}</p>
                  </section>
                ) : null}

                <section className="flex items-baseline justify-between border-t border-border pt-4">
                  <span className="text-xs text-muted-foreground">
                    Net cash retained
                    {refunded > 0 ? ' (after refunds)' : ''}
                  </span>
                  <span
                    className={cn(
                      'font-mono text-lg font-semibold tabular-nums',
                      refunded > 0 ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {formatMinor(payment.amountMinor - refunded, currency)}
                  </span>
                </section>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
