import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ImportState } from '@shared/excel-import/machine'
import type { ImportPlan } from '@shared/excel-import/types'
import { ResultSummary } from './summary'

function statusIcon(status: 'queued' | 'posting' | 'posted' | 'failed'): React.JSX.Element {
  if (status === 'posted') {
    return <CheckCircle2 className="size-4 text-success" strokeWidth={1.9} />
  }
  if (status === 'failed') {
    return <XCircle className="size-4 text-destructive" strokeWidth={1.9} />
  }
  if (status === 'posting') {
    return (
      <Loader2
        className="size-4 animate-spin text-primary motion-reduce:animate-none"
        strokeWidth={1.9}
      />
    )
  }
  return <Clock className="size-4 text-muted-foreground" strokeWidth={1.9} />
}

export function RunStep({
  state,
  plan,
  linkVouchers,
  createdParties,
  createdItems,
  onRetry,
  onReset,
  onViewList
}: {
  state: ImportState
  plan: ImportPlan
  linkVouchers: boolean
  createdParties: number
  createdItems: number
  onRetry: () => void
  onReset: () => void
  onViewList: () => void
}): React.JSX.Element {
  const [confirmReset, setConfirmReset] = useState(false)
  const posting = state.posting
  const bills = posting?.bills ?? []
  const posted = bills.filter((bill) => bill.status === 'posted')
  const failed = bills.filter((bill) => bill.status === 'failed')
  const done = posted.length + failed.length
  const total = bills.length
  const noun = state.target === 'PURCHASE' ? 'purchase bill' : 'sales invoice'
  const plural = total === 1 ? noun : `${noun}s`

  if (state.step === 'importing') {
    return (
      <div className="flex flex-col gap-3">
        <section className="border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[1.125rem] font-semibold">Posting {plural}</h2>
              <span className="font-mono text-[0.8125rem] text-muted-foreground">
                {done} of {total}
              </span>
            </div>
            <p className="mt-1 text-[0.8125rem] text-muted-foreground">
              Keep this page open until every bill has a result. A failure does not stop the rest.
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-label={`Posting ${plural}`}
              className="mt-3 h-1.5 w-full bg-muted"
            >
              <div
                className="h-full origin-left bg-primary transition-transform duration-200"
                style={{ transform: `scaleX(${total === 0 ? 0 : done / total})` }}
              />
            </div>
          </div>

          <ul className="max-h-[460px] divide-y divide-border overflow-y-auto">
            {bills.map((bill) => (
              <li key={bill.key} className="flex items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5">{statusIcon(bill.status)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[0.875rem] font-medium">{bill.label}</span>
                    <span className="text-[0.75rem] text-muted-foreground">
                      row{bill.rowNumbers.length === 1 ? '' : 's'} {bill.rowNumbers.join(', ')}
                    </span>
                  </span>
                  {bill.error ? (
                    <span className="mt-0.5 block text-[0.8125rem] text-destructive">
                      {bill.error}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'text-[0.75rem]',
                    bill.status === 'posted' && 'text-success',
                    bill.status === 'failed' && 'text-destructive',
                    bill.status === 'posting' && 'text-primary',
                    bill.status === 'queued' && 'text-muted-foreground'
                  )}
                >
                  {bill.status === 'posted'
                    ? bill.number
                    : bill.status === 'failed'
                      ? 'Failed'
                      : bill.status === 'posting'
                        ? 'Posting'
                        : 'Waiting'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-[1.125rem] font-semibold">
            {failed.length === 0
              ? `${posted.length} ${posted.length === 1 ? noun : plural} posted`
              : `${posted.length} posted, ${failed.length} failed`}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-muted-foreground">
            {failed.length === 0
              ? 'The bills are in your books. Open one to check the posted values.'
              : 'The posted bills stay posted. Fix the cause, then retry only the failed bills.'}
          </p>
        </div>
        <div className="p-3">
          <ResultSummary
            plan={plan}
            posted={posted.length}
            failed={failed.length}
            newParties={createdParties}
            newItems={createdItems}
          />
        </div>
      </section>

      {posted.length > 0 ? (
        <section className="border border-border bg-card">
          <div className="border-b border-border px-4 py-2.5">
            <h2 className="text-[0.9375rem] font-semibold">Posted</h2>
          </div>
          <ul className="divide-y divide-border">
            {posted.map((bill) => (
              <li key={bill.key} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" strokeWidth={1.9} />
                  <span className="truncate font-mono text-[0.8125rem]">{bill.label}</span>
                </span>
                {bill.voucherId && linkVouchers ? (
                  <Link
                    to={`/vouchers/${bill.voucherId}`}
                    className="font-mono text-[0.8125rem] text-primary underline-offset-4 hover:underline"
                  >
                    {bill.number}
                  </Link>
                ) : (
                  <span className="font-mono text-[0.8125rem]">{bill.number}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failed.length > 0 ? (
        <section className="border border-destructive/40 bg-card">
          <div className="border-b border-destructive/30 px-4 py-2.5">
            <h2 className="text-[0.9375rem] font-semibold text-destructive">Not imported</h2>
          </div>
          <ul className="divide-y divide-border">
            {failed.map((bill) => (
              <li key={bill.key} className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <XCircle className="size-3.5 shrink-0 text-destructive" strokeWidth={1.9} />
                  <span className="font-mono text-[0.8125rem]">{bill.label}</span>
                  <span className="text-[0.75rem] text-muted-foreground">
                    row{bill.rowNumbers.length === 1 ? '' : 's'} {bill.rowNumbers.join(', ')}
                  </span>
                </div>
                <p className="mt-1 text-[0.8125rem] leading-snug text-destructive">{bill.error}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-4 py-2.5">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="size-3.5" strokeWidth={1.75} />
              Retry failed bills
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border border-border bg-card px-4 py-3">
        {linkVouchers ? (
          <Button type="button" size="sm" onClick={onViewList}>
            View {state.target === 'PURCHASE' ? 'purchases' : 'sales'}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)}>
          Import another file
        </Button>
        <p className="ml-auto text-[0.75rem] text-muted-foreground">
          Posted bills are final. Cancel a voucher individually if something is wrong.
        </p>
      </div>

      {confirmReset ? (
        <div
          role="alertdialog"
          aria-labelledby="reset-import-title"
          className="border border-warning/50 bg-warning-soft/40 px-4 py-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" strokeWidth={1.9} />
            <div>
              <h3 id="reset-import-title" className="text-[0.9375rem] font-semibold">
                Start another import?
              </h3>
              <p className="mt-1 max-w-[65ch] text-[0.8125rem] leading-relaxed text-muted-foreground">
                The {posted.length} posted {posted.length === 1 ? noun : plural} stay in your books.
                This does not undo them. Re-importing the same sales file will create duplicate
                invoices.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={onReset}>
                  Start a new import
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmReset(false)}
                >
                  Keep this result
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
