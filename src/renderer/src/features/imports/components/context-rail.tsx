import { Info, Lock } from 'lucide-react'
import { formatMinor } from '@/lib/money'
import type { ImportState } from '@shared/excel-import/machine'
import type { ImportPlan } from '@shared/excel-import/types'

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[0.8125rem] tabular-nums">{value}</dd>
    </div>
  )
}

const GUIDANCE: Record<ImportState['step'], { title: string; body: string }> = {
  file: {
    title: 'What the file should look like',
    body: 'One row per item line. If a bill has three items, it has three rows with the same bill number. The columns can be in any order, and the header does not have to be the first row.'
  },
  range: {
    title: 'Select only the table',
    body: 'Leave out the title above and the totals below. The range is highlighted in blue. Click a row number to say which row holds your column names.'
  },
  map: {
    title: 'One bill, several rows',
    body: 'Rows with the same bill number become one bill with several item lines. Without a bill number, each row becomes its own bill.'
  },
  review: {
    title: 'Nothing is written yet',
    body: 'Errors stop the import and name the row and the fix. Warnings do not stop it. Check the totals against your file before you press Import.'
  },
  importing: {
    title: 'Keep this page open',
    body: 'Bills are posted one at a time. A failure does not stop the rest. When it finishes, failed bills can be retried without posting the successful ones again.'
  },
  done: {
    title: 'Posted bills are final',
    body: 'A posted voucher is never edited. If a bill is wrong, cancel that voucher and post a corrected one. The import itself cannot be undone as a batch.'
  }
}

export function ContextRail({
  state,
  plan,
  createdParties,
  createdItems
}: {
  state: ImportState
  plan: ImportPlan | null
  createdParties?: number
  createdItems?: number
}): React.JSX.Element {
  const guidance = GUIDANCE[state.step]
  const role = state.target === 'PURCHASE' ? 'suppliers' : 'customers'

  return (
    <aside className="flex min-w-0 flex-col gap-3">
      <section className="border border-border bg-card">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {state.step === 'done' ? 'What was created' : 'What will be created'}
          </h2>
        </div>
        <dl className="px-3 py-2">
          {plan ? (
            <>
              <Row
                label={state.target === 'PURCHASE' ? 'Purchase bills' : 'Sales invoices'}
                value={String(plan.stats.bills)}
              />
              <Row label="Item lines" value={String(plan.stats.lines)} />
              <Row label="Total value" value={formatMinor(plan.stats.totalMinor, 'INR')} />
              <Row
                label={`New ${role}`}
                value={String(
                  state.step === 'done'
                    ? (createdParties ?? plan.stats.newParties)
                    : plan.stats.newParties
                )}
              />
              <Row
                label="New items"
                value={String(
                  state.step === 'done'
                    ? (createdItems ?? plan.stats.newItems)
                    : plan.stats.newItems
                )}
              />
              {plan.stats.freeTextLines > 0 ? (
                <Row label="Free-text lines" value={String(plan.stats.freeTextLines)} />
              ) : null}
            </>
          ) : (
            <p className="py-2 text-[0.8125rem] leading-relaxed text-muted-foreground">
              Choose a sheet and map the columns. The count appears here before anything is written.
            </p>
          )}
        </dl>
      </section>

      <section className="border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Info className="size-3.5 text-info" strokeWidth={1.75} />
          <h2 className="text-[0.8125rem] font-semibold">{guidance.title}</h2>
        </div>
        <p className="px-3 py-2.5 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {guidance.body}
        </p>
      </section>

      <p className="flex items-start gap-2 px-1 text-[0.75rem] leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        Your file stays on this computer. Crown Books is offline, and nothing is saved until you
        press Import.
      </p>
    </aside>
  )
}
