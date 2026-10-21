import { Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PAYMENT_METHODS, PAYMENT_METHOD_META } from '@/lib/payment-methods'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/hooks/use-currency'
import type { DayCollection } from '../types'

/**
 * Daily collection summary (Module 09 §63). A hero tile for the day's total
 * plus one tile per payment method that saw activity. The stacked bar keeps
 * the method mix readable at a glance; tiles are proportional to the total.
 */
export function CollectionSummary({
  collection,
  isToday
}: {
  collection: DayCollection
  isToday: boolean
}): React.JSX.Element {
  const { totalMinor, paymentCount, recordedBy, byMethod } = collection
  const currency = useCurrency()
  const methods = PAYMENT_METHODS.filter((m) => byMethod.some((b) => b.method === m))
  const recordedLabel =
    recordedBy.length > 1 ? `${recordedBy.length} staff members` : (recordedBy[0] ?? 'No staff')

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:col-span-1">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Wallet className="size-5" />
          </span>
          <div className="flex flex-col">
            <span className="font-heading text-sm font-medium">
              {isToday ? 'Today&apos;s collection' : 'Day&apos;s collection'}
            </span>
            <span className="text-xs text-muted-foreground">
              {paymentCount} {paymentCount === 1 ? 'payment' : 'payments'} · {recordedLabel}
            </span>
          </div>
        </div>
        <p className="font-mono text-4xl font-bold tracking-tight tabular-nums">
          {formatMinor(totalMinor, currency)}
        </p>
        <div className="flex gap-1">
          {methods.length === 0 ? (
            <div className="h-2 w-full rounded-sm bg-muted" />
          ) : (
            byMethod.map((b) => (
              <div
                key={b.method}
                className="h-2 rounded-sm"
                style={{
                  width: `${totalMinor > 0 ? Math.max((b.totalMinor / totalMinor) * 100, 2) : 0}%`,
                  backgroundColor: PAYMENT_METHOD_META[b.method].color
                }}
                title={`${PAYMENT_METHOD_META[b.method].label} — ${formatMinor(b.totalMinor, currency)}`}
              />
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-2">
        {methods.map((method) => {
          const meta = PAYMENT_METHOD_META[method]
          const bucket = byMethod.find((b) => b.method === method)!
          const Icon = meta.icon
          const share = totalMinor > 0 ? (bucket.totalMinor / totalMinor) * 100 : 0
          return (
            <div
              key={method}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md',
                    'text-muted-foreground'
                  )}
                  style={{ backgroundColor: `${meta.color}22` }}
                >
                  <Icon className="size-4" style={{ color: meta.color }} />
                </span>
                <span className="text-xs font-medium text-muted-foreground">{meta.label}</span>
              </div>
              <span className="font-mono text-xl font-bold tabular-nums">
                {formatMinor(bucket.totalMinor, currency)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {bucket.count} {bucket.count === 1 ? 'payment' : 'payments'} · {share.toFixed(0)}%
              </span>
            </div>
          )
        })}
        {methods.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-6 text-center lg:col-span-2">
            <p className="text-sm font-medium text-muted-foreground">No payments recorded</p>
            <p className="text-xs text-muted-foreground/70">
              Pick another day or record the first payment of the day.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
