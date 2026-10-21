import { Landmark } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import { collectionsByMethod, refundsByMethod, type MethodTotal } from '../build'
import type { Payment, Refund } from '../types'
import type { CurrencyCode } from '@/lib/money'

function MethodBar({
  row,
  total,
  currency
}: {
  row: MethodTotal
  total: number
  currency: CurrencyCode
}): React.JSX.Element {
  const pct = total > 0 ? (row.amountMinor / total) * 100 : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium">{row.label}</span>
        <span className="font-mono text-xs tabular-nums">
          {formatMinor(row.amountMinor, currency)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Collection report (Module 09 §62). The headline number for the range, how it
 * splits by method, and what survives once refunds are taken out — money is
 * always shown gross by method, then net below.
 */
export function CollectionReportCard({
  payments,
  refunds,
  from,
  to
}: {
  payments: Payment[]
  refunds: Refund[]
  from?: Date
  to?: Date
}): React.JSX.Element {
  const methods = collectionsByMethod(payments, from, to)
  const refundRows = refundsByMethod(refunds, from, to)
  const total = methods.reduce((s, m) => s + m.amountMinor, 0)
  const refunded = refundRows.reduce((s, m) => s + m.amountMinor, 0)
  const currency = useCurrency()

  return (
    <Card
      className="crm-gradient-border"
      style={
        {
          '--gradient-start': 'var(--success)',
          '--gradient-end': 'var(--primary)'
        } as React.CSSProperties
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Landmark className="size-5" />
          </span>
          <span className="font-heading text-lg">Collections</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <p className="font-mono text-4xl font-semibold tabular-nums">
            {formatMinor(total, currency)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {methods.length ? 'Gross collections in range' : 'No payments in range'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {methods.map((m) => (
            <MethodBar key={m.key} row={m} total={total} currency={currency} />
          ))}
          {!methods.length ? (
            <p className="text-xs text-muted-foreground">
              Extend the date range to include recorded payments.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Less refunds issued</span>
          <span className="font-mono text-sm font-semibold text-destructive tabular-nums">
            −{formatMinor(refunded, currency)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Net collected</span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {formatMinor(total - refunded, currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
