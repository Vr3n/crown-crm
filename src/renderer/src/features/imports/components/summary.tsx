import { AlertTriangle, CheckCircle2, FileSpreadsheet, ListTree, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMinor } from '@/lib/money'
import type { ImportPlan } from '@shared/excel-import/types'

function Cell({
  label,
  value,
  hint,
  tone
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'danger' | 'warning' | 'success'
}): React.JSX.Element {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1 font-mono text-[1.125rem] leading-none tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success'
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-[0.75rem] leading-tight text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export function ImportSummary({ plan }: { plan: ImportPlan }): React.JSX.Element {
  const problems = plan.stats.errors + plan.stats.warnings
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
      <Cell
        label="Bills"
        value={String(plan.stats.bills)}
        hint={`${plan.stats.readyBills} ready`}
      />
      <Cell label="Item lines" value={String(plan.stats.lines)} hint="One per source row" />
      <Cell
        label="Total value"
        value={formatMinor(plan.stats.totalMinor, 'INR')}
        hint="Before import"
      />
      <Cell
        label="Problems"
        value={String(problems)}
        hint={
          problems === 0
            ? 'Nothing to fix'
            : `${plan.stats.errors} error${plan.stats.errors === 1 ? '' : 's'}, ${plan.stats.warnings} warning${plan.stats.warnings === 1 ? '' : 's'}`
        }
        tone={plan.stats.errors > 0 ? 'danger' : problems > 0 ? 'warning' : 'success'}
      />
    </div>
  )
}

export function ResultSummary({
  plan,
  posted,
  failed,
  newParties,
  newItems
}: {
  plan: ImportPlan
  posted: number
  failed: number
  newParties: number
  newItems: number
}): React.JSX.Element {
  const noun = plan.target === 'PURCHASE' ? 'purchase bill' : 'sales invoice'
  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border border border-border bg-card sm:grid-cols-4 sm:divide-y-0">
      <Cell
        label="Posted"
        value={String(posted)}
        hint={`${noun}${posted === 1 ? '' : 's'}`}
        tone={posted > 0 ? 'success' : 'default'}
      />
      <Cell
        label="Failed"
        value={String(failed)}
        hint={failed > 0 ? 'Retry below' : 'Nothing failed'}
        tone={failed > 0 ? 'danger' : 'success'}
      />
      <Cell
        label={plan.target === 'PURCHASE' ? 'New suppliers' : 'New customers'}
        value={String(newParties)}
        hint="Created during import"
      />
      <Cell label="New items" value={String(newItems)} hint="Created during import" />
    </div>
  )
}

export function SummaryIconRow({ plan }: { plan: ImportPlan }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[0.8125rem] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <FileSpreadsheet className="size-3.5" strokeWidth={1.75} />
        {plan.stats.bills} bills
      </span>
      <span className="inline-flex items-center gap-1.5">
        <ListTree className="size-3.5" strokeWidth={1.75} />
        {plan.stats.lines} lines
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Users className="size-3.5" strokeWidth={1.75} />
        {plan.stats.newParties} new parties
      </span>
      {plan.stats.errors === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-3.5" strokeWidth={1.75} />
          No blocking errors
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="size-3.5" strokeWidth={1.75} />
          {plan.stats.errors} blocking errors
        </span>
      )}
    </div>
  )
}
