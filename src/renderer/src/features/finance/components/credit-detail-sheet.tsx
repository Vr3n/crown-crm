import { PiggyBank, ReceiptText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatDate, initials } from '@/features/leads/format'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { cn } from '@/lib/utils'
import { CREDIT_STATUS_META } from '../constants'
import { creditApplied, creditRemaining, creditStatusOf } from '../build'
import type { Credit } from '../types'

function KeyValue({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

/**
 * Credit record drawer (Module 05 §18). Credit is value kept *inside* the
 * business as a promise against a future invoice — the sheet shows the total,
 * what has already been applied, and what remains available.
 */
export function CreditDetailSheet({
  credit,
  open,
  onOpenChange
}: {
  credit: Credit | null
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const status = credit ? creditStatusOf(credit) : null
  const meta = status ? CREDIT_STATUS_META[status] : null
  const currency = useCurrency()
  const applied = credit ? creditApplied(credit) : 0
  const remaining = credit ? creditRemaining(credit) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 border-l p-0 sm:max-w-md">
        {credit && meta ? (
          <>
            <SheetHeader className="gap-3 border-b border-border/80 pr-12">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-semibold text-primary">
                  {initials(credit.customer.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <SheetTitle className="font-mono text-lg tabular-nums">
                      {credit.creditNo}
                    </SheetTitle>
                    <Badge variant={meta.tone} className="shrink-0">
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="truncate text-sm font-medium">{credit.customer.name}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between rounded-md border border-border bg-card px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Credit value</span>
                <span className="font-mono text-2xl font-semibold tabular-nums">
                  {formatMinor(credit.amountMinor, currency)}
                </span>
              </div>
              <div className="flex divide-x divide-border rounded-md border border-border bg-card">
                <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Applied
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatMinor(applied, currency)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
                    Remaining
                  </span>
                  <span
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      remaining > 0 ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {formatMinor(remaining, currency)}
                  </span>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="flex flex-col gap-7 divide-y divide-border/60">
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <PiggyBank className="size-4" />
                    </span>
                    <h3 className="font-heading text-sm font-medium">Details</h3>
                  </div>
                  <div>
                    <KeyValue label="Issued" value={formatDate(credit.issuedAt)} />
                    <KeyValue
                      label="Source"
                      value={credit.source ? <span className="text-sm">{credit.source}</span> : '—'}
                    />
                    <KeyValue label="Recorded by" value={credit.createdBy} />
                  </div>
                </section>

                <section className="flex flex-col gap-3 pt-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <ReceiptText className="size-4" />
                    </span>
                    <h3 className="font-heading text-sm font-medium">Applied to invoices</h3>
                  </div>
                  {credit.applications.length ? (
                    <div className="flex flex-col gap-2">
                      {credit.applications.map((a) => (
                        <div
                          key={`${a.invoiceNo}-${a.appliedAt}`}
                          className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-xs font-semibold tabular-nums">
                              {a.invoiceNo}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              Applied {formatDate(a.appliedAt)}
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
                      Not applied yet — available against a future invoice.
                    </p>
                  )}
                </section>

                {credit.reason ? (
                  <section className="pt-5">
                    <p className="text-sm text-muted-foreground">{credit.reason}</p>
                  </section>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
