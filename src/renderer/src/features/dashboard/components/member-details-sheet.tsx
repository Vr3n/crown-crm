import { useState } from 'react'
import {
  CalendarClock,
  CircleCheck,
  Mail,
  Phone,
  ReceiptText,
  TriangleAlert,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { formatDate, initials } from '@/features/leads/format'
import { EXPIRING_SOON_DAYS } from '../constants'
import { daysUntil } from '../format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { useMemberRecord, usePaymentRecord } from '../queries'
import type { MembershipExpiration, MembershipInvoice, PaymentDue } from '../types'
import { expirationToRenewTarget, paymentToRenewTarget } from './renew-target'
import { RenewMembershipDialog } from '@/features/memberships/components/renew-membership-dialog'
import type { Membership } from '@/features/customers/types'

/**
 * Member record drawer opened from a dashboard row "View" action.
 *
 * Sections adapt to the source row: expirations get Lead + Membership +
 * Invoices (the sales record, the dates/urgency and the billing history), while
 * payments get Membership + Invoices with the outstanding amount front and
 * centre. Both read from the `memberRecord`/`paymentRecord` read models so the
 * pane feels like a real record even while Modules 01–05 are still mock data.
 */

function StatusChip({ expiresAt }: { expiresAt: string }): React.JSX.Element {
  const d = daysUntil(expiresAt)
  const tone = d <= 0 ? 'destructive' : d <= EXPIRING_SOON_DAYS ? 'warning' : 'default'
  const label =
    d <= 0
      ? `Expired · ${Math.abs(d)}d ago`
      : d <= EXPIRING_SOON_DAYS
        ? `Due in ${d}d`
        : `${d}d left`
  return (
    <Badge variant={tone} className="shrink-0 rounded-none px-2.5 py-1 tabular-nums">
      {label}
    </Badge>
  )
}

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

function InvoiceRow({ invoice }: { invoice: MembershipInvoice }): React.JSX.Element {
  const paid = invoice.status === 'PAID'
  const currency = useCurrency()
  return (
    <div className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-0">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md',
          paid ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
        )}
      >
        {paid ? <CircleCheck className="size-4" /> : <TriangleAlert className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{invoice.label}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{invoice.invoiceNo}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums">
          {formatMinor(invoice.amountMinor, currency)}
        </span>
        <Badge
          variant={paid ? 'success' : 'destructive'}
          className="rounded-none px-1.5 py-0 text-[10px] tabular-nums"
        >
          {paid ? 'Paid' : 'Overdue'}
        </Badge>
      </div>
    </div>
  )
}

function InvoiceSummary({ invoices }: { invoices: MembershipInvoice[] }): React.JSX.Element {
  const currency = useCurrency()
  const billed = invoices.reduce((sum, i) => sum + i.amountMinor, 0)
  const collected = invoices
    .filter((i) => i.status === 'PAID')
    .reduce((sum, i) => sum + i.amountMinor, 0)
  const outstanding = billed - collected
  return (
    <div className="flex divide-x divide-border rounded-md border border-border bg-card">
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Billed</span>
        <span className="text-sm font-semibold tabular-nums">{formatMinor(billed, currency)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Collected</span>
        <span className="text-sm font-semibold text-success tabular-nums">
          {formatMinor(collected, currency)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
          Outstanding
        </span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            outstanding > 0 ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {formatMinor(outstanding, currency)}
        </span>
      </div>
    </div>
  )
}

function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} />
}

function RecordSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2.5">
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
          <Skeleton className="h-16 flex-1" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-14 w-full" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  )
}

export function MemberDetailsSheet({
  row,
  open,
  onOpenChange
}: {
  row: MembershipExpiration | PaymentDue | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  // `row` stays set while `open` goes false, so the content persists through
  // the close (exit) animation instead of flashing empty.
  const isPayment = row != null && 'amountDueMinor' in row
  const currency = useCurrency()
  const [renewTarget, setRenewTarget] = useState<Membership | null>(null)
  const {
    data: expData,
    isLoading: expLoading,
    isError: expError
  } = useMemberRecord(isPayment ? undefined : row?.member.id)
  const {
    data: payData,
    isLoading: payLoading,
    isError: payError
  } = usePaymentRecord(isPayment ? row?.member.id : undefined)
  const data = expData ?? payData
  const isLoading = isPayment ? payLoading : expLoading
  const isError = isPayment ? payError : expError

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {row && (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-heading text-sm font-semibold text-primary">
                  {initials(row.member.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="truncate text-lg">{row.member.name}</SheetTitle>
                    {'amountDueMinor' in row ? (
                      <Badge
                        variant="destructive"
                        className="shrink-0 rounded-none px-2.5 py-1 tabular-nums"
                      >
                        {formatMinor(row.amountDueMinor, currency)} due
                      </Badge>
                    ) : (
                      <StatusChip expiresAt={row.expiresAt} />
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {row.member.id}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0" />
                  {row.member.phone ?? '—'}
                </span>
                {row.member.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{row.member.email}</span>
                  </span>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {isLoading ? (
                <RecordSkeleton />
              ) : isError || !data ? (
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t load this member&apos;s record.
                </p>
              ) : (
                <div className="flex flex-col gap-8 divide-y divide-border/60">
                  {data.lead && (
                    <section>
                      <div>
                        <KeyValue label="Source" value={data.lead.source} />
                        <KeyValue label="Owner" value={data.lead.owner} />
                        <KeyValue label="Plan interest" value={data.lead.planInterest} />
                        <KeyValue label="Goal" value={data.lead.goal} />
                        <KeyValue label="Joined" value={formatDate(data.lead.joinedAt)} />
                      </div>
                    </section>
                  )}

                  <section className="flex flex-col gap-3">
                    <SectionHeading icon={CalendarClock} title="Membership" />
                    {'amountDueMinor' in row ? (
                      <>
                        <div className="flex gap-2.5">
                          <StatTile
                            label="Amount due"
                            value={formatMinor(row.amountDueMinor, currency)}
                            tone="danger"
                          />
                          <StatTile label="Total" value={formatMinor(row.totalMinor, currency)} />
                          <StatTile label="Purchased" value={formatDate(row.purchasedAt)} />
                        </div>
                        <div>
                          <KeyValue label="Plan" value={row.plan} />
                          <KeyValue
                            label="Billing"
                            value={`${data.invoices.length} monthly installments`}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex gap-2.5">
                          <StatTile label="Purchased" value={formatDate(row.purchasedAt)} />
                          <StatTile
                            label="Expires"
                            value={formatDate(row.expiresAt)}
                            tone={daysUntil(row.expiresAt) <= 0 ? 'danger' : 'muted'}
                          />
                          <StatTile
                            label="Days left"
                            value={
                              daysUntil(row.expiresAt) <= 0
                                ? 'Expired'
                                : `${daysUntil(row.expiresAt)}d`
                            }
                            tone={
                              daysUntil(row.expiresAt) <= EXPIRING_SOON_DAYS ? 'danger' : 'accent'
                            }
                          />
                        </div>
                        <div>
                          <KeyValue label="Plan" value={row.plan} />
                          <KeyValue
                            label="Billing"
                            value={`${data.invoices.length} monthly installments`}
                          />
                        </div>
                      </>
                    )}
                  </section>

                  <section className="flex flex-col gap-3">
                    <SectionHeading
                      icon={ReceiptText}
                      title="Invoices"
                      hint={
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {data.invoices.filter((i) => i.status === 'OVERDUE').length > 0
                            ? `${data.invoices.filter((i) => i.status === 'OVERDUE').length} open`
                            : 'All settled'}
                        </span>
                      }
                    />
                    <InvoiceSummary invoices={data.invoices} />
                    <div>
                      {data.invoices.map((invoice) => (
                        <InvoiceRow key={invoice.id} invoice={invoice} />
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </div>

            <SheetFooter className="border-t border-border/80">
              {'amountDueMinor' in row ? (
                <div className="grid w-full grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast('Follow-up scheduled', {
                        description:
                          'Follow-up scheduling arrives with the Members module (Module 02).'
                      })
                    }
                  >
                    Schedule follow-up
                  </Button>
                  <Button
                    onClick={() =>
                      toast('Payment', {
                        description:
                          'Payment collection arrives with the Members module (Module 02).'
                      })
                    }
                  >
                    Make payment
                  </Button>
                  {paymentToRenewTarget(row) ? (
                    <Button
                      variant="outline"
                      className="col-span-2"
                      onClick={() => {
                        const target = paymentToRenewTarget(row)
                        if (target) setRenewTarget(target)
                      }}
                    >
                      Renew membership
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="grid w-full grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() =>
                      toast('Follow-up scheduled', {
                        description:
                          'Follow-up scheduling arrives with the Members module (Module 02).'
                      })
                    }
                  >
                    Schedule follow-up
                  </Button>
                  <Button
                    onClick={() => {
                      if (row && !('amountDueMinor' in row)) {
                        setRenewTarget(expirationToRenewTarget(row))
                      }
                    }}
                  >
                    Renew membership
                  </Button>
                </div>
              )}
            </SheetFooter>
          </>
        )}
        {renewTarget ? (
          <RenewMembershipDialog
            membership={renewTarget}
            open={!!renewTarget}
            onOpenChange={(o) => {
              if (!o) setRenewTarget(null)
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
