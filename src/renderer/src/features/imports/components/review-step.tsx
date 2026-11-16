import { useMemo, useState } from 'react'
import { AlertTriangle, FileWarning, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PartyRow } from '@shared/contracts/masters'
import type {
  ImportPlan,
  ImportTarget,
  PartyResolution,
  PartyResolutionMap
} from '@shared/excel-import/types'
import { BillPreview } from './bill-preview'
import { IssueList } from './issue-list'
import { PartyResolutionPanel } from './party-resolution'
import { ImportSummary } from './summary'

type Filter = 'all' | 'error' | 'warning'

export function ReviewStep({
  plan,
  target,
  parties,
  partiesError,
  resolutions,
  onResolution,
  onRetryLoad
}: {
  plan: ImportPlan
  target: ImportTarget
  parties: PartyRow[]
  partiesError: boolean
  resolutions: PartyResolutionMap
  onResolution: (key: string, resolution: PartyResolution) => void
  onRetryLoad: () => void
}): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all')
  const issues = useMemo(
    () =>
      plan.issues.filter((issue) =>
        filter === 'all'
          ? true
          : filter === 'error'
            ? issue.severity === 'error'
            : issue.severity === 'warning'
      ),
    [filter, plan.issues]
  )

  const errorCount = plan.stats.errors
  const warningCount = plan.stats.warnings

  return (
    <div className="flex flex-col gap-3">
      <ImportSummary plan={plan} />

      {partiesError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 border border-destructive/40 bg-destructive-soft/30 px-3 py-2"
        >
          <p className="text-[0.875rem] text-destructive">
            Could not load your parties. The review cannot match names without them.
          </p>
          <button
            type="button"
            onClick={onRetryLoad}
            className="inline-flex items-center gap-1.5 text-[0.8125rem] text-primary underline-offset-4 hover:underline"
          >
            <RefreshCw className="size-3.5" strokeWidth={1.75} />
            Try again
          </button>
        </div>
      ) : (
        <PartyResolutionPanel
          plan={plan}
          parties={parties}
          target={target}
          resolutions={resolutions}
          onChange={onResolution}
        />
      )}

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <FileWarning className="size-4 text-info" strokeWidth={1.75} />
            <h2 className="text-[0.9375rem] font-semibold">Rows to check</h2>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Filter problems">
            {[
              { id: 'all' as const, label: 'All', count: errorCount + warningCount },
              { id: 'error' as const, label: 'Errors', count: errorCount },
              { id: 'warning' as const, label: 'Warnings', count: warningCount }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={cn(
                  'border px-2 py-1 text-[0.75rem] transition-colors',
                  filter === item.id
                    ? 'border-primary bg-accent-soft font-medium text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted'
                )}
              >
                {item.label}
                <span className="ml-1 font-mono">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {issues.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-4 text-[0.875rem] text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
            {errorCount + warningCount === 0
              ? 'Every row looks good.'
              : filter === 'error'
                ? 'No blocking errors.'
                : 'No warnings.'}
          </div>
        ) : (
          <div className="max-h-[320px] overflow-y-auto">
            <IssueList issues={issues.slice(0, 200)} target={target} />
            {issues.length > 200 ? (
              <p className="border-t border-border px-4 py-2 text-[0.75rem] text-muted-foreground">
                Showing the first 200 of {issues.length} problems. Fix the first ones and choose the
                file again.
              </p>
            ) : null}
          </div>
        )}

        <p className="flex items-start gap-2 border-t border-border px-4 py-2 text-[0.75rem] leading-snug text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.75} />
          Fix errors in Excel and choose the file again. Party choices can be changed here. Nothing
          has been written yet.
        </p>
      </section>

      <section className="border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-[0.9375rem] font-semibold">
            {target === 'PURCHASE' ? 'Purchase bills' : 'Sales invoices'} to create
          </h2>
          <span className="text-[0.75rem] text-muted-foreground">
            {plan.stats.readyBills} ready, {plan.stats.blockedBills} blocked
          </span>
        </div>
        <div className="flex flex-col gap-2 p-3">
          {plan.bills.slice(0, 100).map((bill) => (
            <BillPreview key={bill.key} bill={bill} target={target} />
          ))}
          {plan.bills.length > 100 ? (
            <p className="px-1 py-2 text-[0.75rem] text-muted-foreground">
              Showing the first 100 bills. The import still includes all {plan.bills.length} bills.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
